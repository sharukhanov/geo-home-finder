// Database connection (PostgreSQL via node-postgres + Drizzle ORM).
//
// Railway (and most managed Postgres providers) expose a standard TCP
// connection string in DATABASE_URL, so we use the node-postgres driver
// rather than the Neon serverless driver.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed providers usually require SSL; allow self-signed certs.
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

// Create the tables if they don't exist yet. This keeps the app self-contained
// on first deploy without a separate migration step. The DDL mirrors
// shared/schema.ts — keep them in sync (or switch to drizzle-kit migrations
// once the schema grows).
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attraction_points (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      travel_time_minutes INTEGER NOT NULL,
      arrival_hour INTEGER NOT NULL DEFAULT 9,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Add the column for databases created before arrival_hour existed.
    ALTER TABLE attraction_points ADD COLUMN IF NOT EXISTS arrival_hour INTEGER NOT NULL DEFAULT 9;

    CREATE TABLE IF NOT EXISTS zones (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      center_latitude REAL NOT NULL,
      center_longitude REAL NOT NULL,
      radius_meters REAL NOT NULL,
      zone_type TEXT NOT NULL,
      point_id INTEGER REFERENCES attraction_points(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
