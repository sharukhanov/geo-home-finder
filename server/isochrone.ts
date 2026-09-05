// Real travel-time zones via the 2GIS Isochrone API.
//
// For each attraction point we ask 2GIS "where can you get within N minutes"
// (an isochrone). The optimal place to live is the intersection of every
// point's isochrone — the area from which all points are reachable in time.
//
// One request per point (cheap), unlike a per-grid-cell matrix approach.
// Docs: https://docs.2gis.com/en/api/navigation/isochrone/overview

import { parse as parseWkt } from "wellknown";
import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon, Geometry } from "geojson";

export type Transport = "public_transport" | "driving" | "walking";

const ISOCHRONE_URL = "https://routing.api.2gis.com/isochrone/2.0.0";

export interface Isochrone {
  pointId: number;
  name: string;
  geometry: MultiPolygon;
}

export interface OptimalAreaResult {
  isochrones: Isochrone[];
  // Intersection of all isochrones (where to live). Null if the reachable
  // areas don't overlap at all.
  optimalArea: MultiPolygon | null;
}

function toMultiPolygon(geom: Geometry | null): MultiPolygon | null {
  if (!geom) return null;
  if (geom.type === "MultiPolygon") return geom;
  if (geom.type === "Polygon") {
    return { type: "MultiPolygon", coordinates: [(geom as Polygon).coordinates] };
  }
  return null;
}

// Fetch a single point's reachability area from 2GIS. Returns null on any
// failure so the caller can fall back to the approximate algorithm.
async function fetchIsochrone(
  lat: number,
  lon: number,
  durationSec: number,
  transport: Transport,
): Promise<MultiPolygon | null> {
  const key = process.env.DGIS_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(`${ISOCHRONE_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { lat, lon },
        durations: [durationSec],
        transport,
        reverse: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`2GIS isochrone HTTP ${response.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as {
      isochrones?: Array<{ geometry?: string }>;
    };
    const wkt = data.isochrones?.[0]?.geometry;
    if (!wkt) {
      console.error("2GIS isochrone response had no geometry");
      return null;
    }

    return toMultiPolygon(parseWkt(wkt));
  } catch (err) {
    console.error("2GIS isochrone request failed:", err);
    return null;
  }
}

// Compute isochrones for all points and their intersection. Returns null if
// any point's isochrone could not be fetched (so we fall back cleanly).
export async function computeOptimalArea(
  points: Array<{ id: number; name: string; latitude: number; longitude: number; travelTimeMinutes: number }>,
  transport: Transport,
): Promise<OptimalAreaResult | null> {
  const isochrones: Isochrone[] = [];

  for (const point of points) {
    const geometry = await fetchIsochrone(
      point.latitude,
      point.longitude,
      point.travelTimeMinutes * 60,
      transport,
    );
    if (!geometry) return null; // a failure — let the caller fall back
    isochrones.push({ pointId: point.id, name: point.name, geometry });
  }

  let optimalArea: MultiPolygon | null;
  if (isochrones.length === 1) {
    optimalArea = isochrones[0].geometry;
  } else {
    // polygon-clipping's coordinate types are stricter tuples than GeoJSON's
    // Position[]; the shapes are identical at runtime, so cast across.
    const geoms = isochrones.map((i) => i.geometry.coordinates as unknown as Parameters<typeof polygonClipping.intersection>[0]);
    const intersection = polygonClipping.intersection(
      geoms[0],
      ...geoms.slice(1),
    );
    optimalArea =
      intersection.length > 0
        ? { type: "MultiPolygon", coordinates: intersection as unknown as MultiPolygon["coordinates"] }
        : null;
  }

  return { isochrones, optimalArea };
}
