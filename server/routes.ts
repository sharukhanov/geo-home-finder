import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAttractionPointSchema, insertZoneSchema } from "@shared/schema";
import { searchAddress, reverseGeocode, findDistrictsInPolygon } from "./geocode";
import { computeOptimalArea } from "./isochrone";
import { routingProvider } from "./providers";
import { travelTimeMinutes } from "./travel-time";
import { renderFeedbackPage } from "./feedback-page";
import { renderStatsPage } from "./stats-page";
import { insertEventSchema } from "@shared/schema";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
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
      console.warn(
        `Points too far apart: ${(maxDistance / 1000).toFixed(1)}km vs allowed ${(maxAllowedDistance / 1000).toFixed(1)}km`,
      );
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
  
  return finalAreas;
}

// Abuse limits. These don't stop a real DDoS (that belongs at the edge), but
// they keep one client from draining the 2GIS quota or hammering the service.
//
// Counting per IP alone is wrong for our audience: Russian mobile carriers put
// thousands of subscribers behind a handful of addresses, so a link shared on
// social media would have arrivals locking each other out. Count per anonymous
// browser id instead, and keep a much higher per-IP ceiling as the backstop
// against a single scripted host.
function clientKey(req: Request): string {
  const body = req.body as { userId?: unknown } | undefined;
  const fromBody = typeof body?.userId === "string" ? body.userId : "";
  const fromQuery = typeof req.query.userId === "string" ? req.query.userId : "";
  const id = (fromBody || fromQuery).slice(0, 64);
  // ipKeyGenerator normalises IPv6 so a client can't cycle through a /64.
  return id ? `u:${id}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много запросов. Попробуйте через несколько минут." },
});

// Per-address ceiling. Set well above what a shared mobile network produces,
// but low enough to stop one machine hammering us.
const perIpCeiling = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6000,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  standardHeaders: false,
  legacyHeaders: false,
  message: { message: "Слишком много запросов с этого адреса." },
});

// Each of these calls the routing provider once per place — the expensive path.
const expensiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много расчётов подряд. Подождите пару минут." },
});

// Protects the 2GIS quota from one host, without punishing a shared carrier.
const expensivePerIpCeiling = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 400,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  standardHeaders: false,
  legacyHeaders: false,
  message: { message: "Слишком много расчётов с этого адреса." },
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много отзывов подряд." },
});

// Keeps one anonymous browser from filling the database.
const MAX_POINTS_PER_USER = 20;

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api", perIpCeiling, generalLimiter);
  app.use("/api/zones/calculate", expensivePerIpCeiling, expensiveLimiter);
  app.use("/api/check-address", expensivePerIpCeiling, expensiveLimiter);
  app.use("/api/feedback", feedbackLimiter);

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

      const existing = await storage.getAttractionPoints(validatedData.userId);
      if (existing.length >= MAX_POINTS_PER_USER) {
        return res.status(400).json({
          message: `Можно добавить не больше ${MAX_POINTS_PER_USER} мест. Удалите лишние.`,
        });
      }

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

  // Update an existing attraction point (time, transport, type…).
  app.patch("/api/attraction-points/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      // Same ownership rule as delete — ids are sequential and guessable.
      const userId = String(req.body.userId ?? "");
      const existing = await storage.getAttractionPoint(id);
      if (!existing || !userId || existing.userId !== userId) {
        return res.status(404).json({ message: "Attraction point not found" });
      }

      const patchSchema = z.object({
        type: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        address: z.string().min(1).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        travelTimeMinutes: z.number().int().min(5).max(180).optional(),
        arrivalHour: z.number().int().min(0).max(23).optional(),
        transport: z.enum(["public_transport", "driving", "walking"]).optional(),
      });
      const patch = patchSchema.parse(req.body);

      const updated = await storage.updateAttractionPoint(id, patch);
      if (!updated) {
        return res.status(404).json({ message: "Attraction point not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update attraction point:", error);
      res.status(500).json({ message: "Failed to update attraction point" });
    }
  });

  // Delete attraction point
  app.delete("/api/attraction-points/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.query.userId as string) || "";

      // Ids are sequential, so a point may only be touched by its owner.
      // Answer 404 rather than 403 so ids can't be probed for existence.
      const point = Number.isNaN(id) ? undefined : await storage.getAttractionPoint(id);
      if (!point || !userId || point.userId !== userId) {
        return res.status(404).json({ message: "Attraction point not found" });
      }

      await storage.deleteAttractionPoint(id);
      res.status(204).send();
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

      const points = await storage.getAttractionPoints(userId);
      if (points.length === 0) {
        return res.status(400).json({ message: "No attraction points found" });
      }

      // Try the real isochrone approach first.
      if (routingProvider.isAvailable()) {
        try {
          const result = await computeOptimalArea(points);
          if (result) {
            // Name the districts inside the zone — the practical takeaway.
            const districts = result.optimalArea
              ? await findDistrictsInPolygon(result.optimalArea)
              : [];
            return res.json({
              mode: "isochrone",
              isochrones: result.isochrones,
              optimalArea: result.optimalArea,
              districts,
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

  // --- Feedback (anonymous, tied to the browser id) ---

  // Record a thumbs up/down on the current result.
  app.post("/api/feedback", async (req, res) => {
    try {
      const userId = req.body.userId || "default-user";
      const rating = req.body.rating;
      if (rating !== "like" && rating !== "dislike") {
        return res.status(400).json({ message: "Invalid rating" });
      }
      const context =
        req.body.context != null ? JSON.stringify(req.body.context).slice(0, 4000) : null;

      const saved = await storage.createFeedback({ userId, rating, context, comment: null });
      res.status(201).json({ id: saved.id });
    } catch (error) {
      console.error("Failed to save feedback:", error);
      res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  // Attach an optional written comment to an existing rating.
  app.patch("/api/feedback/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const comment = String(req.body.comment ?? "").slice(0, 2000);
      if (Number.isNaN(id) || !comment.trim()) {
        return res.status(400).json({ message: "Invalid comment" });
      }

      // Feedback ids are sequential, so without this anyone could attach a
      // comment to somebody else's rating. 404 rather than 403, so ids can't
      // be probed for existence.
      const userId = String(req.body.userId ?? "");
      const existing = await storage.getFeedback(id);
      if (!existing || !userId || existing.userId !== userId) {
        return res.status(404).json({ message: "Feedback not found" });
      }

      const updated = await storage.addFeedbackComment(id, comment);
      if (!updated) return res.status(404).json({ message: "Feedback not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Failed to save comment:", error);
      res.status(500).json({ message: "Failed to save comment" });
    }
  });

  // Read collected feedback. Only available when ADMIN_TOKEN is configured.
  app.get("/api/feedback", async (req, res) => {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken || req.query.token !== adminToken) {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const entries = await storage.listFeedback(limit);

      // Readable page in the browser; raw JSON on request.
      if (req.query.format === "json") {
        return res.json(entries);
      }
      res.type("html").send(renderFeedbackPage(entries));
    } catch (error) {
      console.error("Failed to load feedback:", error);
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  // --- Funnel (anonymous, tied to the browser id) ---

  // Record one step of the funnel. Deliberately forgiving: a analytics write
  // must never break the thing it is measuring, so a bad payload is dropped
  // quietly rather than surfaced to the user.
  app.post("/api/events", async (req, res) => {
    const parsed = insertEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(204).send();
    }
    try {
      await storage.createEvent(parsed.data);
    } catch (error) {
      console.error("Failed to record event:", error);
    }
    res.status(204).send();
  });

  // Funnel summary. Same protection as the feedback page.
  app.get("/api/stats", async (req, res) => {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken || req.query.token !== adminToken) {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
      const report = await storage.funnel(days);
      if (req.query.format === "json") {
        return res.json(report);
      }
      res.type("html").send(renderStatsPage(report, adminToken));
    } catch (error) {
      console.error("Failed to build funnel:", error);
      res.status(500).json({ message: "Failed to build funnel" });
    }
  });

  // Wipe the funnel, so a launch starts from zero instead of counting our own
  // testing. POST rather than GET: a link that erases data when something
  // merely follows it is a trap waiting for a crawler or a prefetch.
  app.post("/api/stats/reset", async (req, res) => {
    const adminToken = process.env.ADMIN_TOKEN;
    const supplied = (req.body?.token ?? req.query.token) as unknown;
    if (!adminToken || supplied !== adminToken) {
      return res.status(404).json({ message: "Not found" });
    }
    try {
      const removed = await storage.clearEvents();
      console.warn(`Funnel reset: ${removed} events deleted`);
      res.json({ removed });
    } catch (error) {
      console.error("Failed to reset funnel:", error);
      res.status(500).json({ message: "Failed to reset funnel" });
    }
  });

  // Check a specific candidate address: real travel time to each place.
  app.post("/api/check-address", async (req, res) => {
    try {
      const userId = req.body.userId || "default-user";
      const lat = parseFloat(req.body.lat);
      const lng = parseFloat(req.body.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }

      const points = await storage.getAttractionPoints(userId);
      const results = await Promise.all(
        points.map(async (point) => {
          const minutes = await travelTimeMinutes(
            { lat, lng },
            { lat: point.latitude, lng: point.longitude },
            point.transport,
          );
          return {
            pointId: point.id,
            type: point.type,
            transport: point.transport,
            limitMinutes: point.travelTimeMinutes,
            minutes,
            withinLimit: minutes !== null ? minutes <= point.travelTimeMinutes : null,
          };
        }),
      );

      res.json({ results });
    } catch (error) {
      console.error("Address check failed:", error);
      res.status(500).json({ message: "Failed to check address" });
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

  // Anything under /api that got this far doesn't exist. Without this the SPA
  // catch-all answers with the app's HTML, so a typo in an API path looks like
  // a success to whatever called it.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
