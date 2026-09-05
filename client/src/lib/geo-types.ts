import type { MultiPolygon } from "geojson";

export type Transport = "public_transport" | "car" | "walking";

export interface IsochroneFeature {
  pointId: number;
  name: string;
  geometry: MultiPolygon;
}

// Response shape of POST /api/zones/calculate
export type CalculateResponse =
  | {
      mode: "isochrone";
      transport: Transport;
      isochrones: IsochroneFeature[];
      optimalArea: MultiPolygon | null;
    }
  | {
      mode: "circle";
      zones: unknown[];
    };
