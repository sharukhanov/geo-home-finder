import { eq, desc, gte, sql } from "drizzle-orm";
import { attractionPoints, zones, feedback, events, EVENT_NAMES, type AttractionPoint, type InsertAttractionPoint, type Zone, type InsertZone, type Feedback, type InsertFeedback, type InsertEvent, type AppEvent } from "@shared/schema";
import { db } from "./db";

export interface IStorage {
  // Attraction Points
  getAttractionPoints(userId: string): Promise<AttractionPoint[]>;
  getAttractionPoint(id: number): Promise<AttractionPoint | undefined>;
  createAttractionPoint(point: InsertAttractionPoint): Promise<AttractionPoint>;
  updateAttractionPoint(
    id: number,
    patch: Partial<InsertAttractionPoint>,
  ): Promise<AttractionPoint | undefined>;
  deleteAttractionPoint(id: number): Promise<boolean>;
  deleteAttractionPointsForUser(userId: string): Promise<void>;

  // Zones
  getZones(userId: string): Promise<Zone[]>;
  createZone(zone: InsertZone): Promise<Zone>;
  deleteZonesForUser(userId: string): Promise<void>;

  // Feedback
  createFeedback(entry: InsertFeedback): Promise<Feedback>;
  getFeedback(id: number): Promise<Feedback | undefined>;
  addFeedbackComment(id: number, comment: string): Promise<boolean>;
  listFeedback(limit: number): Promise<Feedback[]>;

  // Funnel
  createEvent(entry: InsertEvent): Promise<void>;
  funnel(sinceDays: number): Promise<FunnelReport>;
  clearEvents(): Promise<number>;
}

/** Visitors who reached each step, plus where they arrived from. */
export interface FunnelReport {
  sinceDays: number;
  steps: Array<{ name: string; visitors: number; events: number }>;
  sources: Array<{ source: string; visitors: number }>;
}

// Counting people, not clicks: one visitor who adds four places is one visitor
// at the "added a place" step. Clicks are reported alongside, since the gap
// between the two is itself informative.
function summarise(rows: Array<Pick<AppEvent, "userId" | "name" | "source">>): Omit<FunnelReport, "sinceDays"> {
  const byStep = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  const bySource = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!byStep.has(row.name)) byStep.set(row.name, new Set());
    byStep.get(row.name)!.add(row.userId);
    counts.set(row.name, (counts.get(row.name) ?? 0) + 1);

    const source = row.source || "прямой заход";
    if (!bySource.has(source)) bySource.set(source, new Set());
    bySource.get(source)!.add(row.userId);
  }

  return {
    steps: EVENT_NAMES.map((name) => ({
      name,
      visitors: byStep.get(name)?.size ?? 0,
      events: counts.get(name) ?? 0,
    })),
    sources: Array.from(bySource.entries())
      .map(([source, ids]) => ({ source, visitors: ids.size }))
      .sort((a, b) => b.visitors - a.visitors),
  };
}

export class MemStorage implements IStorage {
  private attractionPoints: Map<number, AttractionPoint>;
  private zones: Map<number, Zone>;
  private feedback: Map<number, Feedback>;
  private events: Array<InsertEvent & { createdAt: Date }> = [];
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

  async updateAttractionPoint(
    id: number,
    patch: Partial<InsertAttractionPoint>,
  ): Promise<AttractionPoint | undefined> {
    const existing = this.attractionPoints.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.attractionPoints.set(id, updated);
    return updated;
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

  async getFeedback(id: number): Promise<Feedback | undefined> {
    return this.feedback.get(id);
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

  async createEvent(entry: InsertEvent): Promise<void> {
    this.events.push({ ...entry, createdAt: new Date() });
  }

  async funnel(sinceDays: number): Promise<FunnelReport> {
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const rows = this.events
      .filter((e) => e.createdAt.getTime() >= cutoff)
      .map((e) => ({ userId: e.userId, name: e.name, source: e.source ?? null }));
    return { sinceDays, ...summarise(rows) };
  }

  async clearEvents(): Promise<number> {
    const removed = this.events.length;
    this.events = [];
    return removed;
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

  async updateAttractionPoint(
    id: number,
    patch: Partial<InsertAttractionPoint>,
  ): Promise<AttractionPoint | undefined> {
    const rows = await db
      .update(attractionPoints)
      .set(patch)
      .where(eq(attractionPoints.id, id))
      .returning();
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

  async getFeedback(id: number): Promise<Feedback | undefined> {
    const rows = await db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
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

  async createEvent(entry: InsertEvent): Promise<void> {
    await db.insert(events).values(entry);
  }

  async funnel(sinceDays: number): Promise<FunnelReport> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    // Aggregated in the database rather than pulled into memory, so the page
    // stays cheap however much traffic arrives.
    const steps = await db
      .select({
        name: events.name,
        visitors: sql<number>`count(distinct ${events.userId})`.mapWith(Number),
        events: sql<number>`count(*)`.mapWith(Number),
      })
      .from(events)
      .where(gte(events.createdAt, cutoff))
      .groupBy(events.name);

    const sources = await db
      .select({
        source: sql<string>`coalesce(${events.source}, 'прямой заход')`,
        visitors: sql<number>`count(distinct ${events.userId})`.mapWith(Number),
      })
      .from(events)
      .where(gte(events.createdAt, cutoff))
      .groupBy(sql`coalesce(${events.source}, 'прямой заход')`)
      .orderBy(desc(sql`count(distinct ${events.userId})`))
      .limit(20);

    const byName = new Map(steps.map((s) => [s.name, s]));
    return {
      sinceDays,
      steps: EVENT_NAMES.map((name) => ({
        name,
        visitors: byName.get(name)?.visitors ?? 0,
        events: byName.get(name)?.events ?? 0,
      })),
      sources,
    };
  }

  async clearEvents(): Promise<number> {
    const rows = await db.delete(events).returning({ id: events.id });
    return rows.length;
  }
}

// Use Postgres when a database is configured, otherwise fall back to in-memory
// storage (handy for local development without a database).
export const storage: IStorage = process.env.DATABASE_URL
  ? new DbStorage()
  : new MemStorage();
