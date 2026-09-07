import { eq, desc } from "drizzle-orm";
import { attractionPoints, zones, feedback, type AttractionPoint, type InsertAttractionPoint, type Zone, type InsertZone, type Feedback, type InsertFeedback } from "@shared/schema";
import { db } from "./db";

export interface IStorage {
  // Attraction Points
  getAttractionPoints(userId: string): Promise<AttractionPoint[]>;
  getAttractionPoint(id: number): Promise<AttractionPoint | undefined>;
  createAttractionPoint(point: InsertAttractionPoint): Promise<AttractionPoint>;
  deleteAttractionPoint(id: number): Promise<boolean>;
  deleteAttractionPointsForUser(userId: string): Promise<void>;

  // Zones
  getZones(userId: string): Promise<Zone[]>;
  createZone(zone: InsertZone): Promise<Zone>;
  deleteZonesForUser(userId: string): Promise<void>;

  // Feedback
  createFeedback(entry: InsertFeedback): Promise<Feedback>;
  addFeedbackComment(id: number, comment: string): Promise<boolean>;
  listFeedback(limit: number): Promise<Feedback[]>;
}

export class MemStorage implements IStorage {
  private attractionPoints: Map<number, AttractionPoint>;
  private zones: Map<number, Zone>;
  private feedback: Map<number, Feedback>;
  private currentPointId: number;
  private currentZoneId: number;
  private currentFeedbackId: number;

  constructor() {
    this.attractionPoints = new Map();
    this.zones = new Map();
    this.feedback = new Map();
    this.currentPointId = 1;
    this.currentZoneId = 1;
    this.currentFeedbackId = 1;
  }

  async getAttractionPoints(userId: string): Promise<AttractionPoint[]> {
    return Array.from(this.attractionPoints.values()).filter(
      (point) => point.userId === userId,
    );
  }

  async getAttractionPoint(id: number): Promise<AttractionPoint | undefined> {
    return this.attractionPoints.get(id);
  }

  async createAttractionPoint(insertPoint: InsertAttractionPoint): Promise<AttractionPoint> {
    const id = this.currentPointId++;
    const point: AttractionPoint = {
      ...insertPoint,
      id,
      arrivalHour: insertPoint.arrivalHour ?? 9,
      transport: insertPoint.transport ?? "public_transport",
      createdAt: new Date(),
    };
    this.attractionPoints.set(id, point);
    return point;
  }

  async deleteAttractionPoint(id: number): Promise<boolean> {
    return this.attractionPoints.delete(id);
  }

  async deleteAttractionPointsForUser(userId: string): Promise<void> {
    const idsToDelete = Array.from(this.attractionPoints.entries())
      .filter(([, point]) => point.userId === userId)
      .map(([id]) => id);

    idsToDelete.forEach((id) => this.attractionPoints.delete(id));
  }

  async getZones(userId: string): Promise<Zone[]> {
    return Array.from(this.zones.values()).filter(
      (zone) => zone.userId === userId,
    );
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
    const id = this.currentZoneId++;
    const zone: Zone = {
      ...insertZone,
      id,
      createdAt: new Date(),
      pointId: insertZone.pointId ?? null,
    };
    this.zones.set(id, zone);
    return zone;
  }

  async deleteZonesForUser(userId: string): Promise<void> {
    const zonesToDelete = Array.from(this.zones.entries()).filter(
      ([_, zone]) => zone.userId === userId,
    );

    zonesToDelete.forEach(([id]) => {
      this.zones.delete(id);
    });
  }

  async createFeedback(entry: InsertFeedback): Promise<Feedback> {
    const id = this.currentFeedbackId++;
    const saved: Feedback = {
      ...entry,
      id,
      comment: entry.comment ?? null,
      context: entry.context ?? null,
      createdAt: new Date(),
    };
    this.feedback.set(id, saved);
    return saved;
  }

  async addFeedbackComment(id: number, comment: string): Promise<boolean> {
    const existing = this.feedback.get(id);
    if (!existing) return false;
    this.feedback.set(id, { ...existing, comment });
    return true;
  }

  async listFeedback(limit: number): Promise<Feedback[]> {
    return Array.from(this.feedback.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

// PostgreSQL-backed storage (Drizzle ORM). Used when DATABASE_URL is set.
export class DbStorage implements IStorage {
  async getAttractionPoints(userId: string): Promise<AttractionPoint[]> {
    return db
      .select()
      .from(attractionPoints)
      .where(eq(attractionPoints.userId, userId));
  }

  async getAttractionPoint(id: number): Promise<AttractionPoint | undefined> {
    const rows = await db
      .select()
      .from(attractionPoints)
      .where(eq(attractionPoints.id, id));
    return rows[0];
  }

  async createAttractionPoint(insertPoint: InsertAttractionPoint): Promise<AttractionPoint> {
    const rows = await db.insert(attractionPoints).values(insertPoint).returning();
    return rows[0];
  }

  async deleteAttractionPoint(id: number): Promise<boolean> {
    const rows = await db
      .delete(attractionPoints)
      .where(eq(attractionPoints.id, id))
      .returning({ id: attractionPoints.id });
    return rows.length > 0;
  }

  async deleteAttractionPointsForUser(userId: string): Promise<void> {
    await db.delete(attractionPoints).where(eq(attractionPoints.userId, userId));
  }

  async getZones(userId: string): Promise<Zone[]> {
    return db.select().from(zones).where(eq(zones.userId, userId));
  }

  async createZone(insertZone: InsertZone): Promise<Zone> {
    const rows = await db
      .insert(zones)
      .values({ ...insertZone, pointId: insertZone.pointId ?? null })
      .returning();
    return rows[0];
  }

  async deleteZonesForUser(userId: string): Promise<void> {
    await db.delete(zones).where(eq(zones.userId, userId));
  }

  async createFeedback(entry: InsertFeedback): Promise<Feedback> {
    const rows = await db.insert(feedback).values(entry).returning();
    return rows[0];
  }

  async addFeedbackComment(id: number, comment: string): Promise<boolean> {
    const rows = await db
      .update(feedback)
      .set({ comment })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id });
    return rows.length > 0;
  }

  async listFeedback(limit: number): Promise<Feedback[]> {
    return db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(limit);
  }
}

// Use Postgres when a database is configured, otherwise fall back to in-memory
// storage (handy for local development without a database).
export const storage: IStorage = process.env.DATABASE_URL
  ? new DbStorage()
  : new MemStorage();
