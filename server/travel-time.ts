// Real point-to-point travel time — the ground-truth check for a specific
// candidate address, as opposed to the isochrone area approximation.
// The engine behind it is chosen in server/providers/.

import { routingProvider, type GeoPoint, type Transport } from "./providers";

export type { GeoPoint };

// Travel time in minutes, or null if it could not be computed.
export async function travelTimeMinutes(
  from: GeoPoint,
  to: GeoPoint,
  transport: string,
): Promise<number | null> {
  if (!routingProvider.isAvailable()) return null;
  try {
    return await routingProvider.travelTimeMinutes(
      from,
      to,
      (transport as Transport) || "public_transport",
    );
  } catch (err) {
    console.error("Travel time request failed:", err);
    return null;
  }
}
