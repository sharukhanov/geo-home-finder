import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const attractionPoints = pgTable("attraction_points", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // For future user management
  type: text("type").notNull(), // home, work, study, fitness, hobby, family, shopping, other
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  travelTimeMinutes: integer("travel_time_minutes").notNull(),
  // Hour of day (0-23, Moscow time) when the user needs to reach this point.
  // Used to account for typical rush-hour traffic. Defaults to 9 (morning).
  arrivalHour: integer("arrival_hour").notNull().default(9),
  // How the user gets to this particular place: public_transport | driving | walking.
  transport: text("transport").notNull().default("public_transport"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const zones = pgTable("zones", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  centerLatitude: real("center_latitude").notNull(),
  centerLongitude: real("center_longitude").notNull(),
  radiusMeters: real("radius_meters").notNull(),
  zoneType: text("zone_type").notNull(), // ideal, good, far
  pointId: integer("point_id").references(() => attractionPoints.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Anonymous feedback on a calculation: a thumb plus an optional comment.
// Tied to the browser's anonymous id — no accounts needed.
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  rating: text("rating").notNull(), // like | dislike
  comment: text("comment"),
  // JSON snapshot of what was on screen when the user rated.
  context: text("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export const TRANSPORT_MODES = ["public_transport", "driving", "walking"] as const;

// The generated schema only mirrors the column types, so it happily accepted a
// place at latitude 9999 with a 999999-minute limit and a 50KB address. Those
// values reach the routing provider and the map, so they are bounded here —
// matching the limits the PATCH route already enforced.
export const insertAttractionPointSchema = createInsertSchema(attractionPoints)
  .omit({ id: true, createdAt: true })
  .extend({
    userId: z.string().min(1).max(64),
    type: z.string().min(1).max(32),
    name: z.string().min(1).max(120),
    address: z.string().min(1).max(500),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    travelTimeMinutes: z.number().int().min(5).max(180),
    arrivalHour: z.number().int().min(0).max(23).default(9),
    transport: z.enum(TRANSPORT_MODES).default("public_transport"),
  });

export const insertZoneSchema = createInsertSchema(zones).omit({
  id: true,
  createdAt: true,
});

export type InsertAttractionPoint = z.infer<typeof insertAttractionPointSchema>;
export type AttractionPoint = typeof attractionPoints.$inferSelect;
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;
