// Geocoding: 2GIS first (best coverage for Russian addresses, metro, POIs),
// with OpenStreetMap Nominatim as a fallback.
//
// Requests are proxied through the backend so we can set a proper User-Agent
// (required by Nominatim), keep the API key server-side, and avoid CORS.

const NOMINATIM_BASE =
  process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ??
  "Fatera/1.0 (housing-optimizer; contact: example@example.com)";

const COUNTRY_CODES = process.env.GEOCODER_COUNTRY_CODES ?? "ru";
const LANGUAGE = process.env.GEOCODER_LANGUAGE ?? "ru";

const DGIS_KEY = process.env.DGIS_API_KEY;
// Full-text catalog search (addresses, streets, metro stations, POIs).
const DGIS_ITEMS_URL = "https://catalog.api.2gis.com/3.0/items";
// Reverse geocoding (coordinates -> nearest address).
const DGIS_GEOCODE_URL = "https://catalog.api.2gis.com/3.0/items/geocode";

// Bias search toward a city so results aren't scattered across the country.
// Defaults to central Moscow; override via env for other cities.
const BIAS_LON = process.env.GEOCODER_BIAS_LON ?? "37.6176";
const BIAS_LAT = process.env.GEOCODER_BIAS_LAT ?? "55.7558";
const BIAS_RADIUS = process.env.GEOCODER_BIAS_RADIUS ?? "40000"; // meters
// Nominatim viewbox around the same area (west,south,east,north).
const NOMINATIM_VIEWBOX = process.env.GEOCODER_VIEWBOX ?? "37.2,55.4,38.0,56.0";

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

// --- 2GIS ---------------------------------------------------------------

interface DgisItem {
  full_name?: string;
  name?: string;
  address_name?: string;
  point?: { lat: number; lon: number };
}

function dgisItemsToResults(items: DgisItem[]): GeocodeResult[] {
  return items
    .filter((item) => item.point)
    .map((item) => ({
      // full_name is the most complete ("г Москва, Волоколамское шоссе, 71к1");
      // fall back to name + address for POIs like metro stations.
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

async function dgisFetch(baseUrl: string, params: Record<string, string>): Promise<DgisItem[]> {
  if (!DGIS_KEY) return [];

  const url = new URL(baseUrl);
  url.searchParams.set("key", DGIS_KEY);
  url.searchParams.set("fields", "items.point,items.full_name,items.address_name");
  url.searchParams.set("locale", "ru_RU");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  if (!response.ok) {
    // 404 = nothing found (normal). Log other errors so key/access issues surface.
    if (response.status !== 404) {
      console.error(`2GIS HTTP ${response.status} for ${baseUrl}`);
    }
    return [];
  }

  const data = (await response.json()) as { result?: { items?: DgisItem[] } };
  return data.result?.items ?? [];
}

// Forward search over the 2GIS catalog (addresses, streets, metro, POIs),
// biased to the configured city so results aren't scattered nationwide.
async function dgisSearch(query: string, limit: number): Promise<GeocodeResult[]> {
  const items = await dgisFetch(DGIS_ITEMS_URL, {
    q: query,
    page_size: String(limit),
    location: `${BIAS_LON},${BIAS_LAT}`,
    radius: BIAS_RADIUS,
    type: "building,street,station,attraction,adm_div.place,adm_div.city,branch",
  });
  return dgisItemsToResults(items);
}

// Reverse geocoding via the dedicated 2GIS endpoint.
async function dgisReverse(lat: number, lon: number): Promise<GeocodeResult[]> {
  const items = await dgisFetch(DGIS_GEOCODE_URL, {
    lat: String(lat),
    lon: String(lon),
  });
  return dgisItemsToResults(items);
}

// --- Nominatim ----------------------------------------------------------

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
}

async function nominatimFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${NOMINATIM_BASE}${path}`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Geocoder responded with ${response.status}`);
  }
  return response.json();
}

// --- Public API ---------------------------------------------------------

// Forward geocoding: address string -> list of candidate locations.
export async function searchAddress(
  query: string,
  limit = 5,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Prefer 2GIS full-text search.
  try {
    const dgis = await dgisSearch(trimmed, limit);
    if (dgis.length > 0) return dgis;
  } catch (err) {
    console.error("2GIS search failed, falling back to Nominatim:", err);
  }

  // Fallback: Nominatim, bounded to the configured area so results stay local.
  try {
    const places = (await nominatimFetch("/search", {
      q: trimmed,
      limit: String(limit),
      countrycodes: COUNTRY_CODES,
      addressdetails: "0",
      viewbox: NOMINATIM_VIEWBOX,
      bounded: "1",
    })) as NominatimPlace[];

    return places.map((place) => ({
      displayName: place.display_name,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    }));
  } catch (err) {
    console.error("Nominatim search failed:", err);
    return [];
  }
}

// Reverse geocoding: coordinates -> human-readable address.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  // Prefer 2GIS.
  try {
    const dgis = await dgisReverse(lat, lng);
    if (dgis.length > 0) return dgis[0];
  } catch (err) {
    console.error("2GIS reverse geocode failed, falling back to Nominatim:", err);
  }

  // Fallback: Nominatim.
  try {
    const place = (await nominatimFetch("/reverse", {
      lat: String(lat),
      lon: String(lng),
    })) as NominatimPlace | { error: string };

    if (!("display_name" in place)) return null;
    return {
      displayName: place.display_name,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    };
  } catch (err) {
    console.error("Nominatim reverse failed:", err);
    return null;
  }
}
