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
const DGIS_GEOCODE_URL = "https://catalog.api.2gis.com/3.0/items/geocode";

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

async function dgisGeocode(params: Record<string, string>): Promise<GeocodeResult[]> {
  if (!DGIS_KEY) return [];

  const url = new URL(DGIS_GEOCODE_URL);
  url.searchParams.set("key", DGIS_KEY);
  url.searchParams.set("fields", "items.point,items.full_name,items.address_name");
  url.searchParams.set("locale", "ru_RU");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  if (!response.ok) {
    // 404 just means "nothing found" for 2GIS geocode — not an error worth logging loudly.
    if (response.status !== 404) {
      console.error(`2GIS geocode HTTP ${response.status}`);
    }
    return [];
  }

  const data = (await response.json()) as { result?: { items?: DgisItem[] } };
  const items = data.result?.items ?? [];
  return items
    .filter((item) => item.point)
    .map((item) => ({
      displayName: item.full_name || item.name || item.address_name || "",
      latitude: item.point!.lat,
      longitude: item.point!.lon,
    }));
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

  // Prefer 2GIS.
  try {
    const dgis = await dgisGeocode({ q: trimmed, page_size: String(limit) });
    if (dgis.length > 0) return dgis;
  } catch (err) {
    console.error("2GIS geocode failed, falling back to Nominatim:", err);
  }

  // Fallback: Nominatim.
  try {
    const places = (await nominatimFetch("/search", {
      q: trimmed,
      limit: String(limit),
      countrycodes: COUNTRY_CODES,
      addressdetails: "0",
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
    const dgis = await dgisGeocode({ lat: String(lat), lon: String(lng) });
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
