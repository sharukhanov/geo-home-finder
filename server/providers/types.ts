// Contracts every geo provider implements.
//
// All vendor-specific work (2GIS today; OpenTripPlanner, Valhalla or another
// engine tomorrow) lives behind these interfaces, so swapping the engine is a
// change in server/providers/ and nowhere else.

import type { MultiPolygon } from "geojson";

export type Transport = "public_transport" | "driving" | "walking";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

export interface IsochroneRequest {
  lat: number;
  lng: number;
  durationSec: number;
  transport: Transport;
  /** Hour of day (Moscow) the trip is planned for, to reflect rush hour. */
  arrivalHour: number;
}

/** Reachability areas and point-to-point travel times. */
export interface RoutingProvider {
  readonly name: string;
  /** False when the provider isn't configured (e.g. missing API key). */
  isAvailable(): boolean;
  /** Area reachable within the given time, or null if it can't be computed. */
  isochrone(request: IsochroneRequest): Promise<MultiPolygon | null>;
  /** Door-to-door travel time in minutes, or null if unavailable. */
  travelTimeMinutes(
    from: GeoPoint,
    to: GeoPoint,
    transport: Transport,
  ): Promise<number | null>;
}

/** Address search and reverse lookup. */
export interface GeocodingProvider {
  readonly name: string;
  isAvailable(): boolean;
  search(query: string, limit: number): Promise<GeocodeResult[]>;
  reverse(lat: number, lng: number): Promise<GeocodeResult | null>;
  /** Optional: districts inside an area. Not every provider can do this. */
  districtsInPolygon?(area: MultiPolygon): Promise<string[]>;
}
