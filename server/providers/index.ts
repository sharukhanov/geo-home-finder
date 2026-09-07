// Provider selection.
//
// To move off 2GIS (for example when the API key expires), add a module here
// implementing RoutingProvider / GeocodingProvider and register it below —
// nothing outside server/providers/ needs to change.

import { dgisProvider } from "./dgis";
import { nominatimProvider } from "./nominatim";
import type { GeocodingProvider, RoutingProvider } from "./types";

export * from "./types";

const ROUTING_PROVIDERS: Record<string, RoutingProvider> = {
  "2gis": dgisProvider,
};

// Which engine does routing/isochrones. Only 2GIS today.
const selected = process.env.GEO_PROVIDER ?? "2gis";

export const routingProvider: RoutingProvider =
  ROUTING_PROVIDERS[selected] ?? dgisProvider;

// Geocoders are tried in order until one returns something.
export const geocodingProviders: GeocodingProvider[] = [
  dgisProvider,
  nominatimProvider,
];
