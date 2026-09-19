import { eq, desc, gte, sql } from "drizzle-orm";
import { attractionPoints, zones, feedback, events, EVENT_NAMES, type AttractionPoint, type InsertAttractionPoint, type Zone, type InsertZone, type Feedback, type InsertFeedback, type InsertEvent, type AppEvent } from "@shared/schema";
import { db, pool } from "./db";

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
  metrics: ProductMetrics;
}

/**
 * Product metrics derived from the same events. Every one of these is
 * computable from what we already collect — nothing here is estimated.
 * A null means "not enough data to divide by", which is different from zero
 * and is rendered as such.
 */
export interface ProductMetrics {
  visitors: number;
  activationRate: number | null;
  valueRate: number | null;
  deepInterestRate: number | null;
  bounceRate: number | null;
  returnRate: number | null;
  medianSecondsToValue: number | null;
  avgPlacesPerActivated: number | null;
  approximateShare: number | null;
  feedback: {
    total: number;
    likes: number;
    dislikes: number;
    likeShare: number | null;
    responseRate: number | null;
  };
}

/** One visitor's activity in the period, however it was gathered. */
export interface VisitorRow {
  firstOpen: Date | null;
  firstZone: Date | null;
  places: number;
  checks: number;
  zones: number;
  exactZones: number;
  activeDays: number;
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Shared by both storage backends so the two can't drift apart.
export function computeMetrics(
  rows: VisitorRow[],
  feedbackCounts: { likes: number; dislikes: number },
): ProductMetrics {
  const visitors = rows.length;
  const activated = rows.filter((r) => r.places > 0);
  const reachedValue = rows.filter((r) => r.zones > 0);
  const deep = rows.filter((r) => r.checks > 0);
  // Opened and did nothing else — the clearest sign the first screen failed.
  const bounced = rows.filter((r) => r.places === 0 && r.zones === 0 && r.checks === 0);
  const returned = rows.filter((r) => r.activeDays > 1);

  // How long it takes to get the answer, for those who got it.
  const secondsToValue = rows
    .filter((r) => r.firstOpen && r.firstZone && r.firstZone >= r.firstOpen)
    .map((r) => Math.round((r.firstZone!.getTime() - r.firstOpen!.getTime()) / 1000));

  const totalZones = rows.reduce((sum, r) => sum + r.zones, 0);
  const exactZones = rows.reduce((sum, r) => sum + r.exactZones, 0);
  const totalPlaces = activated.reduce((sum, r) => sum + r.places, 0);

  const feedbackTotal = feedbackCounts.likes + feedbackCounts.dislikes;

  return {
    visitors,
    activationRate: share(activated.length, visitors),
    valueRate: share(reachedValue.length, visitors),
    deepInterestRate: share(deep.length, visitors),
    bounceRate: share(bounced.length, visitors),
    returnRate: share(returned.length, visitors),
    medianSecondsToValue: median(secondsToValue),
    avgPlacesPerActivated: activated.length
      ? Math.round((totalPlaces / activated.length) * 10) / 10
      : null,
    approximateShare: share(totalZones - exactZones, totalZones),
    feedback: {
      total: feedbackTotal,
      likes: feedbackCounts.likes,
      dislikes: feedbackCounts.dislikes,
      likeShare: share(feedbackCounts.likes, feedbackTotal),
      responseRate: share(feedbackTotal, reachedValue.length),
    },
  };
}

// Counting people, not clicks: one visitor who adds four places is one visitor
// at the "added a place" step. Clicks are reported alongside, since the gap
// between the two is itself informative.
export const DIRECT_SOURCE = "прямой заход";

function summarise(
  rows: Array<Pick<AppEvent, "userId" | "name" | "source" | "createdAt">>,
): Pick<FunnelReport, "steps" | "sources"> {
  const byStep = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  // Each visitor is attributed to where they first came from. Counting every
  // source a visitor's events carry would list the same person twice and make
  // the column add up to more than the number of visitors.
  const firstTouch = new Map<string, { source: string | null; at: Date }>();

  for (const row of rows) {
    if (!byStep.has(row.name)) byStep.set(row.name, new Set());
    byStep.get(row.name)!.add(row.userId);
    counts.set(row.name, (counts.get(row.name) ?? 0) + 1);

    const seen = firstTouch.get(row.userId);
    const better =
      !seen ||
      // A real source beats "direct", and otherwise the earlier event wins.
      (!seen.source && !!row.source) ||
      (!!seen.source === !!row.source && row.createdAt < seen.at);
    if (better) firstTouch.set(row.userId, { source: row.source, at: row.createdAt });
  }

  const bySource = new Map<string, number>();
  for (const { source } of Array.from(firstTouch.values())) {
    const key = source || DIRECT_SOURCE;
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }

  return {
    steps: EVENT_NAMES.map((name) => ({
      name,
      visitors: byStep.get(name)?.size ?? 0,
      events: counts.get(name) ?? 0,
    })),
    sources: Array.from(bySource.entries())
      .map(([source, visitors]) => ({ source, visitors }))
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
    const recent = this.events.filter((e) => e.createdAt.getTime() >= cutoff);
    const rows = recent.map((e) => ({
      userId: e.userId,
      name: e.name,
      source: e.source ?? null,
      createdAt: e.createdAt,
    }));

    const perVisitor = new Map<string, VisitorRow & { days: Set<string> }>();
    for (const e of recent) {
      let row = perVisitor.get(e.userId);
      if (!row) {
        row = {
          firstOpen: null, firstZone: null, places: 0, checks: 0,
          zones: 0, exactZones: 0, activeDays: 0, days: new Set(),
        };
        perVisitor.set(e.userId, row);
      }
      row.days.add(e.createdAt.toISOString().slice(0, 10));
      if (e.name === "open" && (!row.firstOpen || e.createdAt < row.firstOpen)) {
        row.firstOpen = e.createdAt;
      }
      if (e.name === "place_added") row.places += 1;
      if (e.name === "address_checked") row.checks += 1;
      if (e.name === "zone_shown") {
        row.zones += 1;
        if (e.props?.includes('"mode":"isochrone"')) row.exactZones += 1;
        if (!row.firstZone || e.createdAt < row.firstZone) row.firstZone = e.createdAt;
      }
    }
    const visitors = Array.from(perVisitor.values()).map((r) => ({
      ...r,
      activeDays: r.days.size,
    }));

    const since = new Date(cutoff);
    const ratings = Array.from(this.feedback.values()).filter((f) => f.createdAt >= since);
    const metrics = computeMetrics(visitors, {
      likes: ratings.filter((f) => f.rating === "like").length,
      dislikes: ratings.filter((f) => f.rating === "dislike").length,
    });

    return { sinceDays, ...summarise(rows), metrics };
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

    // One row per visitor, taken from where they first arrived, so the column
    // adds up to the number of visitors instead of double-counting anyone
    // whose later events carry a different tag.
    const sourceRows = await pool.query<{ source: string; visitors: string }>(
      `SELECT coalesce(source, $2) AS source, count(*) AS visitors
         FROM (
           SELECT DISTINCT ON (user_id) user_id, source
             FROM events
            WHERE created_at >= $1
            ORDER BY user_id, (source IS NULL), created_at
         ) AS first_touch
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 20`,
      [cutoff, DIRECT_SOURCE],
    );
    const sources = sourceRows.rows.map((r) => ({
      source: r.source,
      visitors: Number(r.visitors),
    }));

    // One row per visitor, aggregated by the database. `props LIKE` rather
    // than a JSON cast: a malformed value would make the cast throw and take
    // the whole report down, and this only needs to spot one known marker.
    const visitorRows = await pool.query<{
      first_open: Date | null;
      first_zone: Date | null;
      places: string;
      checks: string;
      zones: string;
      exact_zones: string;
      active_days: string;
    }>(
      `SELECT
         min(created_at) FILTER (WHERE name = 'open')       AS first_open,
         min(created_at) FILTER (WHERE name = 'zone_shown') AS first_zone,
         count(*) FILTER (WHERE name = 'place_added')       AS places,
         count(*) FILTER (WHERE name = 'address_checked')   AS checks,
         count(*) FILTER (WHERE name = 'zone_shown')        AS zones,
         count(*) FILTER (WHERE name = 'zone_shown'
                          AND props LIKE '%"mode":"isochrone"%') AS exact_zones,
         count(DISTINCT created_at::date)                   AS active_days
       FROM events
       WHERE created_at >= $1
       GROUP BY user_id`,
      [cutoff],
    );

    const ratings = await pool.query<{ rating: string; count: string }>(
      `SELECT rating, count(*) AS count FROM feedback WHERE created_at >= $1 GROUP BY rating`,
      [cutoff],
    );
    const ratingCount = (name: string) =>
      Number(ratings.rows.find((r) => r.rating === name)?.count ?? 0);

    const metrics = computeMetrics(
      visitorRows.rows.map((r) => ({
        firstOpen: r.first_open,
        firstZone: r.first_zone,
        places: Number(r.places),
        checks: Number(r.checks),
        zones: Number(r.zones),
        exactZones: Number(r.exact_zones),
        activeDays: Number(r.active_days),
      })),
      { likes: ratingCount("like"), dislikes: ratingCount("dislike") },
    );

    const byName = new Map(steps.map((s) => [s.name, s]));
    return {
      sinceDays,
      steps: EVENT_NAMES.map((name) => ({
        name,
        visitors: byName.get(name)?.visitors ?? 0,
        events: byName.get(name)?.events ?? 0,
      })),
      sources,
      metrics,
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
