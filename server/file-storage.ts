// File-backed storage: the in-memory store plus a JSON snapshot on disk.
//
// Why this exists: the hosting provider's managed PostgreSQL would not start,
// and plain memory loses every place and every funnel event on each restart.
// A hosting plan's persistent folder (/data on Amvera) survives restarts and
// redeploys, so a snapshot there is enough — at this scale the whole dataset is
// a few hundred kilobytes and the app already holds it all in memory anyway.
//
// It is not a database and does not pretend to be one: a single process, no
// concurrent writers, no queries. If the data ever outgrows that, switch
// DATABASE_URL back on and DbStorage takes over with no other change.

import fs from "fs";
import path from "path";
import { MemStorage } from "./storage";
import type { AttractionPoint, Zone, Feedback, InsertEvent } from "@shared/schema";

/** Events are the only unbounded table; keep the newest and drop the rest. */
const MAX_EVENTS = 100_000;

/** Coalesce a burst of writes into one, so a page load isn't many fsyncs. */
const SAVE_DEBOUNCE_MS = 1_000;

interface Snapshot {
  version: 1;
  points: AttractionPoint[];
  zones: Zone[];
  feedback: Feedback[];
  events: Array<InsertEvent & { createdAt: string }>;
}

export class FileStorage extends MemStorage {
  private readonly file: string;
  private timer: NodeJS.Timeout | null = null;
  private writing = false;
  private dirty = false;

  constructor(file: string) {
    super();
    this.file = file;
    this.load();
  }

  private load(): void {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, "utf-8");
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        // A corrupt or unreadable file must not take the app down, but losing
        // data silently is worse than a loud log.
        console.error(`!!! could not read ${this.file}:`, err);
      }
      return;
    }

    let snapshot: Snapshot;
    try {
      snapshot = JSON.parse(raw);
    } catch (err) {
      console.error(`!!! ${this.file} is not valid JSON — starting empty:`, err);
      return;
    }

    for (const point of snapshot.points ?? []) {
      this.attractionPoints.set(point.id, { ...point, createdAt: new Date(point.createdAt) });
      this.currentPointId = Math.max(this.currentPointId, point.id + 1);
    }
    for (const zone of snapshot.zones ?? []) {
      this.zones.set(zone.id, { ...zone, createdAt: new Date(zone.createdAt) });
      this.currentZoneId = Math.max(this.currentZoneId, zone.id + 1);
    }
    for (const entry of snapshot.feedback ?? []) {
      this.feedback.set(entry.id, { ...entry, createdAt: new Date(entry.createdAt) });
      this.currentFeedbackId = Math.max(this.currentFeedbackId, entry.id + 1);
    }
    this.events = (snapshot.events ?? []).map((e) => ({ ...e, createdAt: new Date(e.createdAt) }));

    console.log(
      `storage: loaded ${this.attractionPoints.size} places, ${this.feedback.size} ratings, ` +
        `${this.events.length} events from ${this.file}`,
    );
  }

  protected override onChange(): void {
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, SAVE_DEBOUNCE_MS);
    // Don't hold the process open just for a pending snapshot.
    this.timer.unref?.();
  }

  /** Write the whole snapshot. Public so a shutdown can flush synchronously. */
  async save(): Promise<void> {
    if (this.writing) {
      // A save is already in flight; whatever changed since will be picked up
      // by the follow-up scheduled at the end of it.
      this.onChange();
      return;
    }
    this.writing = true;
    this.dirty = false;

    const snapshot: Snapshot = {
      version: 1,
      points: Array.from(this.attractionPoints.values()),
      zones: Array.from(this.zones.values()),
      feedback: Array.from(this.feedback.values()),
      events: this.events as unknown as Snapshot["events"],
    };

    // Write beside the target and rename: a crash mid-write then leaves the
    // previous good snapshot in place instead of a truncated file.
    const tmp = `${this.file}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(tmp, JSON.stringify(snapshot), "utf-8");
      await fs.promises.rename(tmp, this.file);
    } catch (err) {
      console.error(`!!! could not save ${this.file} — data will be lost on restart:`, err);
    } finally {
      this.writing = false;
      if (this.dirty) this.onChange();
    }
  }
}

/**
 * Where to keep the snapshot, or null to stay in memory only.
 *
 * DATA_DIR is set by whoever runs us; on Amvera the persistent mount is /data.
 * Nothing is written unless the folder is actually writable, because a
 * snapshot on an ephemeral disk is a false promise.
 */
export function resolveDataFile(): string | null {
  const dir = process.env.DATA_DIR;
  if (!dir) return null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    console.error(`!!! DATA_DIR=${dir} is not writable — falling back to memory:`, err);
    return null;
  }
  return path.join(dir, "fatera.json");
}
