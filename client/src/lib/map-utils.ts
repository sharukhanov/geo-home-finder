// Utility functions for map-related calculations

export interface Coordinates {
  lat: number;
  lng: number;
}

// Calculate distance between two points in meters using Haversine formula
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (point1.lat * Math.PI) / 180;
  const φ2 = (point2.lat * Math.PI) / 180;
  const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
  const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

// Forward geocoding: search an address string via the backend geocoder.
// Returns a list of candidate locations (empty if nothing matched).
export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Allow pasting raw "lat, lng" coordinates as a shortcut.
  if (trimmed.includes(",") && trimmed.split(",").length === 2) {
    const [latStr, lngStr] = trimmed.split(",");
    const lat = parseFloat(latStr.trim());
    const lng = parseFloat(lngStr.trim());
    if (!isNaN(lat) && !isNaN(lng)) {
      return [{ displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, latitude: lat, longitude: lng }];
    }
  }

  const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(trimmed)}`);
  if (!response.ok) return [];
  return response.json();
}

// Convert an address to a single best-match coordinate, or null if not found.
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const results = await searchAddress(address);
  if (results.length === 0) return null;
  return { lat: results[0].latitude, lng: results[0].longitude };
}

// Reverse geocoding: turn coordinates into a human-readable address.
// Falls back to formatted coordinates if the service is unavailable.
export async function reverseGeocode(coordinates: Coordinates): Promise<string> {
  try {
    const response = await fetch(
      `/api/geocode/reverse?lat=${coordinates.lat}&lng=${coordinates.lng}`,
    );
    if (response.ok) {
      const result = (await response.json()) as GeocodeResult | null;
      if (result?.displayName) return result.displayName;
    }
  } catch {
    // ignore and fall back to coordinates
  }
  return `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`;
}

// Calculate optimal zone radius based on travel time and priority
export function calculateZoneRadius(travelTimeMinutes: number, priority: number): {
  ideal: number;
  good: number;
  far: number;
} {
  const baseRadius = travelTimeMinutes * 300; // More realistic: 300m per minute (public transport)
  const priorityMultiplier = Math.max(0.5, priority / 5); // Minimum 0.5 to avoid tiny zones

  return {
    ideal: baseRadius * 0.7 * priorityMultiplier,
    good: baseRadius * priorityMultiplier,
    far: baseRadius * 1.3 * priorityMultiplier,
  };
}
