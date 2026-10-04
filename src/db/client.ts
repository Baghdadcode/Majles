import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getDbPath } from "../config/env";
import * as schema from "./schema";

export type CouncilDb = ReturnType<typeof openDb>;

/** Opens (and migrates) the local SQLite file. Pass ":memory:" in tests. */
export function openDb(path: string = getDbPath()) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
