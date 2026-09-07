// Real point-to-point travel time via 2GIS routing.
//
// This is the ground-truth check for a specific candidate address: "if I lived
// here, how long would it actually take me to reach each of my places?".
// It complements the isochrone zones (which are an area approximation).
//
// Docs:
//   https://docs.2gis.com/en/api/navigation/routing/overview
//   https://docs.2gis.com/en/api/navigation/public-transport/overview

const ROUTING_URL = "https://routing.api.2gis.com/routing/7.0.0/global";
const PUBLIC_TRANSPORT_URL = "https://routing.api.2gis.com/public_transport/2.0";

// Public transport modes to consider for a route.
const PT_MODES = [
  "metro",
  "light_metro",
  "bus",
  "trolleybus",
  "tram",
  "shuttle_bus",
  "suburban_train",
];

export interface LatLng {
  lat: number;
  lng: number;
}

async function postJson(url: string, body: unknown): Promise<any | null> {
  const key = process.env.DGIS_API_KEY;
  if (!key) return null;

  const response = await fetch(`${url}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`2GIS routing HTTP ${response.status} (${url}): ${text.slice(0, 200)}`);
    return null;
  }
  return response.json();
}

// Travel time in minutes, or null if it could not be computed.
export async function travelTimeMinutes(
  from: LatLng,
  to: LatLng,
  transport: string,
): Promise<number | null> {
  try {
    if (transport === "public_transport") {
      const data = await postJson(PUBLIC_TRANSPORT_URL, {
        source: { point: { lat: from.lat, lon: from.lng } },
        target: { point: { lat: to.lat, lon: to.lng } },
        transport: PT_MODES,
        locale: "ru",
      });
      if (!data) return null;

      // The endpoint returns a list of route options (shape varies slightly).
      const routes: any[] = Array.isArray(data) ? data : (data.result ?? []);
      const durations = routes
        .map((r) => r?.total_duration)
        .filter((d): d is number => typeof d === "number");
      if (durations.length === 0) return null;
      return Math.round(Math.min(...durations) / 60);
    }

    // driving / walking
    const data = await postJson(ROUTING_URL, {
      points: [
        { type: "stop", lat: from.lat, lon: from.lng },
        { type: "stop", lat: to.lat, lon: to.lng },
      ],
      locale: "ru",
      transport,
      route_mode: "fastest",
      traffic_mode: transport === "driving" ? "jam" : "statistics",
    });
    if (!data) return null;

    const duration = data.result?.[0]?.total_duration;
    return typeof duration === "number" ? Math.round(duration / 60) : null;
  } catch (err) {
    console.error("Travel time request failed:", err);
    return null;
  }
}
