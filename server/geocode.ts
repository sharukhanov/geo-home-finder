// Geocoding orchestration: try each configured provider in order.
// The provider implementations live in server/providers/.

import type { MultiPolygon } from "geojson";
import { geocodingProviders, type GeocodeResult } from "./providers";

export type { GeocodeResult };

// Forward geocoding: address string -> candidate locations.
export async function searchAddress(
  query: string,
  limit = 5,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  for (const provider of geocodingProviders) {
    if (!provider.isAvailable()) continue;
    try {
      const results = await provider.search(trimmed, limit);
      if (results.length > 0) return results;
    } catch (err) {
      console.error(`Geocoder "${provider.name}" search failed:`, err);
    }
  }
  return [];
}

// Reverse geocoding: coordinates -> human-readable address.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeResult | null> {
  for (const provider of geocodingProviders) {
    if (!provider.isAvailable()) continue;
    try {
      const result = await provider.reverse(lat, lng);
      if (result) return result;
    } catch (err) {
      console.error(`Geocoder "${provider.name}" reverse failed:`, err);
    }
  }
  return null;
}

// Districts inside the optimal zone — the practical takeaway for a search.
// Uses the first provider that supports it.
export async function findDistrictsInPolygon(area: MultiPolygon): Promise<string[]> {
  for (const provider of geocodingProviders) {
    if (!provider.isAvailable() || !provider.districtsInPolygon) continue;
    try {
      return await provider.districtsInPolygon(area);
    } catch (err) {
      console.error(`Provider "${provider.name}" district lookup failed:`, err);
    }
  }
  return [];
}
