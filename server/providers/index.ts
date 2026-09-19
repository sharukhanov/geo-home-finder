// Provider selection.
//
// To move off 2GIS (for example when the API key expires), add a module here
// implementing RoutingProvider / GeocodingProvider and register it below —
// nothing outside server/providers/ needs to change.

import type { MultiPolygon } from "geojson";
import { dgisProvider } from "./dgis";
import { nominatimProvider } from "./nominatim";
import { TtlCache } from "./cache";
import type { GeocodingProvider, IsochroneRequest, RoutingProvider } from "./types";

export * from "./types";

// Isochrones describe a typical weekday at a given hour, so the same request
// yields the same area — cache it and spare the API quota.
const isochroneCache = new TtlCache<MultiPolygon | null>(6 * 60 * 60 * 1000, 500);

function isochroneKey(r: IsochroneRequest): string {
  // ~11 m of precision is plenty; it also collapses near-identical clicks.
  return [
    r.lat.toFixed(4),
    r.lng.toFixed(4),
    r.durationSec,
    r.transport,
    r.arrivalHour,
  ].join("|");
}

// Wraps a provider so repeated isochrone requests are served from memory.
function withIsochroneCache(provider: RoutingProvider): RoutingProvider {
  return {
    name: provider.name,
    isAvailable: () => provider.isAvailable(),
    travelTimeMinutes: (from, to, transport) =>
      provider.travelTimeMinutes(from, to, transport),
    // Forwarded explicitly: this wrapper rebuilds the object field by field,
    // so anything added to the contract and not listed here silently vanishes.
    // The diagnostic must also bypass the cache to report live state.
    selfTest: provider.selfTest ? (point) => provider.selfTest!(point) : undefined,
    async isochrone(request) {
      const key = isochroneKey(request);
      const cached = isochroneCache.get(key);
      // A cached failure isn't worth replaying; only reuse real results.
      if (cached) return cached;

      const result = await provider.isochrone(request);
      if (result) isochroneCache.set(key, result);
      return result;
    },
  };
}

const ROUTING_PROVIDERS: Record<string, RoutingProvider> = {
  "2gis": dgisProvider,
};

// Which engine does routing/isochrones. Only 2GIS today.
const selected = process.env.GEO_PROVIDER ?? "2gis";

export const routingProvider: RoutingProvider = withIsochroneCache(
  ROUTING_PROVIDERS[selected] ?? dgisProvider,
);

// Geocoders are tried in order until one returns something.
export const geocodingProviders: GeocodingProvider[] = [
  dgisProvider,
  nominatimProvider,
];
