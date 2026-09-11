// 2GIS implementation of the routing and geocoding contracts.
//
// Everything specific to 2GIS — endpoints, request shapes, WKT parsing, the
// rush-hour timestamp format — is contained in this file.
//
// Docs:
//   https://docs.2gis.com/en/api/navigation/isochrone/overview
//   https://docs.2gis.com/en/api/navigation/routing/overview
//   https://docs.2gis.com/en/api/navigation/public-transport/overview
//   https://docs.2gis.com/en/api/search/places/overview

import { parse as parseWkt } from "wellknown";
import type { Geometry, MultiPolygon, Polygon } from "geojson";
import type {
  GeoPoint,
  GeocodeResult,
  GeocodingProvider,
  IsochroneRequest,
  RoutingProvider,
  Transport,
} from "./types";

const ISOCHRONE_URL = "https://routing.api.2gis.com/isochrone/2.0.0";
const ROUTING_URL = "https://routing.api.2gis.com/routing/7.0.0/global";
const PUBLIC_TRANSPORT_URL = "https://routing.api.2gis.com/public_transport/2.0";
const ITEMS_URL = "https://catalog.api.2gis.com/3.0/items";
const GEOCODE_URL = "https://catalog.api.2gis.com/3.0/items/geocode";

// Documented ceiling for a single isochrone duration.
const MAX_ISOCHRONE_SEC = 3600;

const PT_MODES = [
  "metro",
  "light_metro",
  "bus",
  "trolleybus",
  "tram",
  "shuttle_bus",
  "suburban_train",
];

// Bias address search toward a city so results aren't scattered nationwide.
const BIAS_LON = process.env.GEOCODER_BIAS_LON ?? "37.6176";
const BIAS_LAT = process.env.GEOCODER_BIAS_LAT ?? "55.7558";
const BIAS_RADIUS = process.env.GEOCODER_BIAS_RADIUS ?? "40000";

function apiKey(): string | undefined {
  return process.env.DGIS_API_KEY;
}

// --- helpers ------------------------------------------------------------

function toMultiPolygon(geom: Geometry | null): MultiPolygon | null {
  if (!geom) return null;
  if (geom.type === "MultiPolygon") return geom;
  if (geom.type === "Polygon") {
    return { type: "MultiPolygon", coordinates: [(geom as Polygon).coordinates] };
  }
  return null;
}

// RFC 3339 UTC timestamp for the next weekday at the given Moscow hour, so
// 2GIS uses typical rush-hour traffic instead of the current moment.
function nextWeekdayStartTime(hourMsk: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hourMsk - 3, 0, 0, 0); // Moscow is UTC+3
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function postJson(url: string, body: unknown): Promise<any | null> {
  const key = apiKey();
  if (!key) return null;

  const response = await fetch(`${url}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`2GIS HTTP ${response.status} (${url}): ${text.slice(0, 200)}`);
    return null;
  }
  return response.json();
}

interface DgisItem {
  full_name?: string;
  name?: string;
  address_name?: string;
  point?: { lat: number; lon: number };
}

async function getItems(
  baseUrl: string,
  params: Record<string, string>,
): Promise<DgisItem[]> {
  const key = apiKey();
  if (!key) return [];

  const url = new URL(baseUrl);
  url.searchParams.set("key", key);
  url.searchParams.set("fields", "items.point,items.full_name,items.address_name");
  url.searchParams.set("locale", "ru_RU");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url);
  if (!response.ok) {
    // 404 simply means "nothing found" for these endpoints.
    if (response.status !== 404) {
      console.error(`2GIS HTTP ${response.status} for ${baseUrl}`);
    }
    return [];
  }

  const data = (await response.json()) as { result?: { items?: DgisItem[] } };
  return data.result?.items ?? [];
}

function itemsToResults(items: DgisItem[]): GeocodeResult[] {
  return items
    .filter((item) => item.point)
    .map((item) => ({
      displayName:
        item.full_name ||
        [item.name, item.address_name].filter(Boolean).join(", ") ||
        item.name ||
        "",
      latitude: item.point!.lat,
      longitude: item.point!.lon,
    }))
    .filter((r) => r.displayName);
}

// Keep the WKT short enough for a URL — isochrone rings have many vertices.
function simplifyRing(ring: number[][], max = 30): number[][] {
  if (ring.length <= max) return ring;
  const step = Math.ceil(ring.length / max);
  const out: number[][] = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  return out;
}

// --- provider -----------------------------------------------------------

export const dgisProvider: RoutingProvider & GeocodingProvider = {
  name: "2gis",

  isAvailable() {
    return Boolean(apiKey());
  },

  async isochrone({ lat, lng, durationSec, transport, arrivalHour }: IsochroneRequest) {
    // 2GIS documents a 3600s ceiling per isochrone. We still send longer
    // durations (the cap can be raised per account), but log it so a failed
    // long-commute zone is easy to explain.
    if (durationSec > MAX_ISOCHRONE_SEC) {
      console.warn(
        `Isochrone duration ${durationSec}s exceeds the documented 2GIS limit ` +
          `of ${MAX_ISOCHRONE_SEC}s — the request may be rejected.`,
      );
    }

    const data = await postJson(ISOCHRONE_URL, {
      start: { lat, lon: lng },
      durations: [durationSec],
      transport,
      reverse: false,
      start_time: nextWeekdayStartTime(arrivalHour),
    });
    if (!data) return null;

    const wkt = (data.isochrones as Array<{ geometry?: string }> | undefined)?.[0]?.geometry;
    if (!wkt) {
      console.error("2GIS isochrone response had no geometry");
      return null;
    }
    return toMultiPolygon(parseWkt(wkt));
  },

  async travelTimeMinutes(from: GeoPoint, to: GeoPoint, transport: Transport) {
    if (transport === "public_transport") {
      const data = await postJson(PUBLIC_TRANSPORT_URL, {
        source: { point: { lat: from.lat, lon: from.lng } },
        target: { point: { lat: to.lat, lon: to.lng } },
        transport: PT_MODES,
        locale: "ru",
      });
      if (!data) return null;

      const routes: any[] = Array.isArray(data) ? data : (data.result ?? []);
      const durations = routes
        .map((r) => r?.total_duration)
        .filter((d): d is number => typeof d === "number");
      return durations.length > 0 ? Math.round(Math.min(...durations) / 60) : null;
    }

    const data = await postJson(ROUTING_URL, {
      points: [
        { type: "stop", lat: from.lat, lon: from.lng },
        { type: "stop", lat: to.lat, lon: to.lng },
      ],
      locale: "ru",
      transport,
      route_mode: "fastest",
      traffic_mode: transport === "driving" ? "jam" : "statistics",
    });
    if (!data) return null;

    const duration = data.result?.[0]?.total_duration;
    return typeof duration === "number" ? Math.round(duration / 60) : null;
  },

  async search(query: string, limit: number) {
    return itemsToResults(
      await getItems(ITEMS_URL, {
        q: query,
        page_size: String(limit),
        location: `${BIAS_LON},${BIAS_LAT}`,
        radius: BIAS_RADIUS,
        type: "building,street,station,attraction,adm_div.place,adm_div.city,branch",
      }),
    );
  },

  async reverse(lat: number, lng: number) {
    const results = itemsToResults(
      await getItems(GEOCODE_URL, { lat: String(lat), lon: String(lng) }),
    );
    return results[0] ?? null;
  },

  async districtsInPolygon(area: MultiPolygon) {
    const rings = area.coordinates.map((poly) => poly[0]).filter(Boolean);
    if (rings.length === 0) return [];

    const largest = rings.reduce((a, b) => (b.length > a.length ? b : a));
    const simplified = simplifyRing(largest);
    if (simplified.length < 4) return [];

    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    const closed =
      first[0] === last[0] && first[1] === last[1] ? simplified : [...simplified, first];

    const wkt = `POLYGON((${closed
      .map(([lon, lat]) => `${lon.toFixed(6)} ${lat.toFixed(6)}`)
      .join(",")}))`;

    const items = await getItems(ITEMS_URL, {
      polygon: wkt,
      type: "adm_div.district",
      page_size: "20",
    });
    const names = items.map((i) => i.name || i.full_name || "").filter(Boolean);
    return Array.from(new Set(names));
  },
};
