// Geocoding via OpenStreetMap Nominatim.
//
// We proxy requests through the backend so we can:
//   1. Set a proper User-Agent (required by the Nominatim usage policy).
//   2. Avoid CORS issues in the browser.
//   3. Swap the provider later without touching the client.
//
// Provider is configurable through env vars so the same code can point at a
// self-hosted Nominatim, a commercial geocoder, etc.

const NOMINATIM_BASE =
  process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

// Nominatim asks every application to identify itself with a real contact.
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ??
  "Fatera/1.0 (housing-optimizer; contact: example@example.com)";

// Bias results toward a country/region. Defaults to Russia since the product
// currently targets Russian cities.
const COUNTRY_CODES = process.env.GEOCODER_COUNTRY_CODES ?? "ru";
const LANGUAGE = process.env.GEOCODER_LANGUAGE ?? "ru";

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

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

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Geocoder responded with ${response.status}`);
  }

  return response.json();
}

// Forward geocoding: address string -> list of candidate locations.
export async function searchAddress(
  query: string,
  limit = 5,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

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
}

// Reverse geocoding: coordinates -> human-readable address.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
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
}
