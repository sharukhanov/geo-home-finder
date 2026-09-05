import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAttractionPointSchema, insertZoneSchema } from "@shared/schema";
import { searchAddress, reverseGeocode } from "./geocode";
import { computeOptimalArea, type Transport } from "./isochrone";
import { z } from "zod";

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate optimal living areas between attraction points
function calculateOptimalLivingAreas(points: any[]) {
  if (points.length === 0) return [];
  
  // Check if points are too far apart (rough check)
  if (points.length >= 2) {
    const distances = [];
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dist = calculateDistance(
          { lat: points[i].latitude, lng: points[i].longitude },
          { lat: points[j].latitude, lng: points[j].longitude }
        );
        distances.push(dist);
      }
    }
    const maxDistance = Math.max(...distances);
    const avgTravelTime = points.reduce((sum, p) => sum + p.travelTimeMinutes, 0) / points.length;
    
    // If the farthest points are more than 3x the average allowed travel distance
    const maxAllowedDistance = avgTravelTime * 300 * 3; // 300m/min * 3 for margin
    if (maxDistance > maxAllowedDistance) {
      console.log(`Points too far apart: max distance ${(maxDistance/1000).toFixed(1)}km, allowed ${(maxAllowedDistance/1000).toFixed(1)}km`);
    }
  }
  
  const optimalAreas: Array<{
    lat: number;
    lng: number;
    radius: number;
    type: 'ideal' | 'good' | 'far';
    score: number;
  }> = [];

  // Define search bounds around all points
  const latitudes = points.map(p => p.latitude);
  const longitudes = points.map(p => p.longitude);
  const bounds = {
    north: Math.max(...latitudes) + 0.05,
    south: Math.min(...latitudes) - 0.05,
    east: Math.max(...longitudes) + 0.05,
    west: Math.min(...longitudes) - 0.05,
  };

  const gridSize = 0.005; // ~500m between grid points
  
  // Analyze each point in the grid
  for (let lat = bounds.south; lat <= bounds.north; lat += gridSize) {
    for (let lng = bounds.west; lng <= bounds.east; lng += gridSize) {
      const gridPoint = { lat, lng };
      let totalScore = 0;
      let maxTime = 0;
      let allPointsReachable = true;

      // Calculate accessibility to each attraction point
      for (const point of points) {
        const distance = calculateDistance(gridPoint, {
          lat: point.latitude,
          lng: point.longitude,
        });
        
        // Convert distance to travel time (300m/min average)
        const travelTime = distance / 300;
        const maxAllowedTime = point.travelTimeMinutes;
        
        maxTime = Math.max(maxTime, travelTime);
        
        if (travelTime <= maxAllowedTime) {
          // Score: better for closer distances (all points have equal priority now)
          const distanceScore = (1 - travelTime / maxAllowedTime) * 10;
          totalScore += distanceScore;
        } else {
          allPointsReachable = false;
          break; // This location doesn't work
        }
      }

      // Only consider locations where all points are reachable
      if (allPointsReachable && totalScore > 0) {
        // Determine zone type based on efficiency score and max travel time
        const avgAllowedTime = points.reduce((sum, p) => sum + p.travelTimeMinutes, 0) / points.length;
        const efficiency = totalScore / (points.length * 10); // Normalize score (max points * score factor)
        
        let type: 'ideal' | 'good' | 'far';
        let radius: number;
        
        // Classify zones based on travel time efficiency relative to each point's individual limit
        const worstTimeRatio = Math.max(...points.map(point => {
          const distance = calculateDistance(gridPoint, {
            lat: point.latitude,
            lng: point.longitude,
          });
          const travelTime = distance / 300;
          return travelTime / point.travelTimeMinutes;
        }));
        
        // Use very generous thresholds to ensure all zone types
        if (worstTimeRatio <= 0.9) {
          type = 'ideal';
          radius = 1000;
        } else if (worstTimeRatio <= 0.98) {
          type = 'good';
          radius = 800;
        } else {
          type = 'far';
          radius = 600;
        }
        
        // Debug: log some examples
        if (optimalAreas.length < 10) {
          console.log(`Point ${lat.toFixed(4)}, ${lng.toFixed(4)}: worstTimeRatio=${worstTimeRatio.toFixed(3)}, type=${type}`);
        }

        optimalAreas.push({
          lat,
          lng,
          radius,
          type,
          score: totalScore,
        });
      }
    }
  }

  // Sort by score and separate by type
  let idealAreas = optimalAreas.filter(a => a.type === 'ideal').sort((a, b) => b.score - a.score);
  let goodAreas = optimalAreas.filter(a => a.type === 'good').sort((a, b) => b.score - a.score);
  const farAreas = optimalAreas.filter(a => a.type === 'far').sort((a, b) => b.score - a.score);
  
  // Force create ideal zones from best good zones if no ideal zones exist
  if (idealAreas.length === 0 && goodAreas.length > 0) {
    const bestGoodAreas = goodAreas.slice(0, 3);
    bestGoodAreas.forEach(area => {
      area.type = 'ideal';
      area.radius = 1000;
    });
    idealAreas = bestGoodAreas;
    goodAreas = goodAreas.slice(3);
  }
  
  const finalAreas: typeof optimalAreas = [];
  
  // Add areas ensuring we have different types
  const addAreasOfType = (areas: typeof optimalAreas, maxCount: number) => {
    for (const area of areas) {
      // Check if this area overlaps significantly with existing areas
      const overlaps = finalAreas.some(existing => {
        const distance = calculateDistance(area, existing);
        return distance < Math.min(area.radius, existing.radius) * 0.7;
      });
      
      if (!overlaps) {
        finalAreas.push(area);
      }
      
      if (finalAreas.filter(a => a.type === area.type).length >= maxCount) break;
    }
  };
  
  // Add up to 3 ideal, 7 good, and 3 far areas
  addAreasOfType(idealAreas, 3);
  addAreasOfType(goodAreas, 7);
  addAreasOfType(farAreas, 3);
  
  console.log(`Generated zones: ${idealAreas.length} ideal, ${goodAreas.length} good, ${farAreas.length} far`);
  console.log(`Final zones: ${finalAreas.filter(a => a.type === 'ideal').length} ideal, ${finalAreas.filter(a => a.type === 'good').length} good, ${finalAreas.filter(a => a.type === 'far').length} far`);

  return finalAreas;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get attraction points for a user
  app.get("/api/attraction-points", async (req, res) => {
    try {
      const userId = req.query.userId as string || "default-user";
      const points = await storage.getAttractionPoints(userId);
      res.json(points);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attraction points" });
    }
  });

  // Create new attraction point
  app.post("/api/attraction-points", async (req, res) => {
    try {
      const validatedData = insertAttractionPointSchema.parse(req.body);
      const point = await storage.createAttractionPoint(validatedData);
      res.status(201).json(point);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create attraction point" });
      }
    }
  });

  // Delete attraction point
  app.delete("/api/attraction-points/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteAttractionPoint(id);
      
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: "Attraction point not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete attraction point" });
    }
  });

  // Reset everything for a user: remove all attraction points and zones
  app.post("/api/reset", async (req, res) => {
    try {
      const userId = req.body.userId || "default-user";
      await storage.deleteAttractionPointsForUser(userId);
      await storage.deleteZonesForUser(userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to reset data" });
    }
  });

  // Get zones for a user
  app.get("/api/zones", async (req, res) => {
    try {
      const userId = req.query.userId as string || "default-user";
      const zones = await storage.getZones(userId);
      res.json(zones);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch zones" });
    }
  });

  // Calculate optimal living zones.
  //
  // Preferred: real travel-time isochrones from 2GIS (public transport / car /
  // walking), intersected to find where all points are reachable in time.
  // Fallback: the approximate straight-line grid algorithm (also used when no
  // 2GIS key is configured or the service is unavailable).
  app.post("/api/zones/calculate", async (req, res) => {
    try {
      const userId = req.body.userId || "default-user";
      const transport = (req.body.transport as Transport) || "public_transport";

      const points = await storage.getAttractionPoints(userId);
      if (points.length === 0) {
        return res.status(400).json({ message: "No attraction points found" });
      }

      // Try the real isochrone approach first.
      if (process.env.DGIS_API_KEY) {
        try {
          const result = await computeOptimalArea(points, transport);
          if (result) {
            return res.json({
              mode: "isochrone",
              transport,
              isochrones: result.isochrones,
              optimalArea: result.optimalArea,
            });
          }
          console.warn("Isochrone computation unavailable; falling back to approximate mode");
        } catch (err) {
          console.error("Isochrone error; falling back to approximate mode:", err);
        }
      }

      // Fallback: approximate circle-based zones (persisted so they survive reload).
      await storage.deleteZonesForUser(userId);
      const optimalAreas = calculateOptimalLivingAreas(points);
      const newZones = [];
      for (const area of optimalAreas) {
        const zone = await storage.createZone({
          userId,
          centerLatitude: area.lat,
          centerLongitude: area.lng,
          radiusMeters: area.radius,
          zoneType: area.type,
          pointId: null,
        });
        newZones.push(zone);
      }

      res.json({ mode: "circle", zones: newZones });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate zones" });
    }
  });

  // Forward geocoding: search an address string for coordinate candidates
  app.get("/api/geocode/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      if (!query.trim()) {
        return res.json([]);
      }
      const results = await searchAddress(query);
      res.json(results);
    } catch (error) {
      console.error("Geocode search failed:", error);
      res.status(502).json({ message: "Geocoding service unavailable" });
    }
  });

  // Reverse geocoding: turn coordinates into a human-readable address
  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      const result = await reverseGeocode(lat, lng);
      res.json(result);
    } catch (error) {
      console.error("Reverse geocode failed:", error);
      res.status(502).json({ message: "Geocoding service unavailable" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
