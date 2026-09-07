// OpenStreetMap Nominatim — free geocoding fallback used when the primary
// provider is unavailable. It cannot do routing or districts.

import type { GeocodeResult, GeocodingProvider } from "./types";

const BASE_URL = process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

// Nominatim asks every application to identify itself with a real contact.
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ??
  "Fatera/1.0 (housing-optimizer; contact: example@example.com)";

const COUNTRY_CODES = process.env.GEOCODER_COUNTRY_CODES ?? "ru";
const LANGUAGE = process.env.GEOCODER_LANGUAGE ?? "ru";
// Keep fallback results local instead of matching words across the country.
const VIEWBOX = process.env.GEOCODER_VIEWBOX ?? "37.2,55.4,38.0,56.0";

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
}

async function request(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Nominatim responded with ${response.status}`);
  }
  return response.json();
}

export const nominatimProvider: GeocodingProvider = {
  name: "nominatim",

  isAvailable() {
    return true; // no key required
  },

  async search(query: string, limit: number): Promise<GeocodeResult[]> {
    const places = (await request("/search", {
      q: query,
      limit: String(limit),
      countrycodes: COUNTRY_CODES,
      addressdetails: "0",
      viewbox: VIEWBOX,
      bounded: "1",
    })) as NominatimPlace[];

    return places.map((place) => ({
      displayName: place.display_name,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    }));
  },

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const place = (await request("/reverse", {
      lat: String(lat),
      lon: String(lng),
    })) as NominatimPlace | { error: string };

    if (!("display_name" in place)) return null;
    return {
      displayName: place.display_name,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    };
  },
};
