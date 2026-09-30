// Picks the storage backend, in order of how well it keeps data:
//
//   1. PostgreSQL, when DATABASE_URL is set — the real thing.
//   2. A JSON snapshot on the host's persistent folder, when DATA_DIR is set
//      and writable — survives restarts and redeploys, no database needed.
//   3. Memory — fine for local development, loses everything on restart.
//
// This lives apart from storage.ts because file-storage.ts extends MemStorage,
// and choosing the instance inside storage.ts would make the two modules
// import each other.

import { type IStorage, DbStorage, MemStorage } from "./storage";
import { FileStorage, resolveDataFile } from "./file-storage";

function pick(): IStorage {
  if (process.env.DATABASE_URL) return new DbStorage();

  const file = resolveDataFile();
  if (file) return new FileStorage(file);

  // Silently serving from memory looks fine until a restart wipes everyone's
  // places, so say it loudly rather than in passing.
  console.warn(
    "!!! no DATABASE_URL and no writable DATA_DIR — storing data IN MEMORY. " +
      "Everything is lost on restart.",
  );
  return new MemStorage();
}

export const storage: IStorage = pick();
