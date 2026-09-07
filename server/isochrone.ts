// Optimal-living-area logic.
//
// For each place we ask the routing provider "where can you get within N
// minutes" (an isochrone). The best place to live is the intersection of every
// place's isochrone — the area from which all of them are reachable in time.
//
// The provider behind the isochrones is chosen in server/providers/, so this
// file holds only the product logic.

import polygonClipping from "polygon-clipping";
import type { MultiPolygon } from "geojson";
import { routingProvider, type Transport } from "./providers";

export type { Transport };

export interface Isochrone {
  pointId: number;
  name: string;
  geometry: MultiPolygon;
}

export interface OptimalAreaResult {
  isochrones: Isochrone[];
  /** Intersection of all isochrones. Null when they don't overlap at all. */
  optimalArea: MultiPolygon | null;
}

// Returns null if any place's isochrone could not be fetched, so the caller
// can fall back to the approximate algorithm.
export async function computeOptimalArea(
  points: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    travelTimeMinutes: number;
    arrivalHour: number;
    transport: string;
  }>,
): Promise<OptimalAreaResult | null> {
  if (!routingProvider.isAvailable()) return null;

  const isochrones: Isochrone[] = [];

  for (const point of points) {
    // Each place has its own way of getting there (drive to work, walk to gym).
    const geometry = await routingProvider.isochrone({
      lat: point.latitude,
      lng: point.longitude,
      durationSec: point.travelTimeMinutes * 60,
      transport: (point.transport as Transport) || "public_transport",
      arrivalHour: point.arrivalHour,
    });
    if (!geometry) return null;
    isochrones.push({ pointId: point.id, name: point.name, geometry });
  }

  let optimalArea: MultiPolygon | null;
  if (isochrones.length === 1) {
    optimalArea = isochrones[0].geometry;
  } else {
    // polygon-clipping's coordinate types are stricter tuples than GeoJSON's
    // Position[]; the shapes are identical at runtime, so cast across.
    const geoms = isochrones.map(
      (i) => i.geometry.coordinates as unknown as Parameters<typeof polygonClipping.intersection>[0],
    );
    const intersection = polygonClipping.intersection(geoms[0], ...geoms.slice(1));
    optimalArea =
      intersection.length > 0
        ? {
            type: "MultiPolygon",
            coordinates: intersection as unknown as MultiPolygon["coordinates"],
          }
        : null;
  }

  return { isochrones, optimalArea };
}
