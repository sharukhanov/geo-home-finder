import type { MultiPolygon } from "geojson";

export type Transport = "public_transport" | "driving" | "walking";

export interface IsochroneFeature {
  pointId: number;
  name: string;
  geometry: MultiPolygon;
}

// Response shape of POST /api/zones/calculate
export type CalculateResponse =
  | {
      mode: "isochrone";
      isochrones: IsochroneFeature[];
      optimalArea: MultiPolygon | null;
      districts: string[];
    }
  | {
      mode: "circle";
      zones: unknown[];
      /**
       * Ways of travelling the routing provider had no data for. Empty when
       * the fallback happened for some other reason.
       */
      failedTransports?: Transport[];
    };
