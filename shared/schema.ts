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

export const insertAttractionPointSchema = createInsertSchema(attractionPoints).omit({
  id: true,
  createdAt: true,
});

export const insertZoneSchema = createInsertSchema(zones).omit({
  id: true,
  createdAt: true,
});

export type InsertAttractionPoint = z.infer<typeof insertAttractionPointSchema>;
export type AttractionPoint = typeof attractionPoints.$inferSelect;
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;
