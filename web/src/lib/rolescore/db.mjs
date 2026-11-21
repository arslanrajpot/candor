// RoleScore's own SQLite store — fully separate from the candor tracker DB.
// Zero new dependencies: node:sqlite, stable from Node 22.13 (tracker.mjs
// already depends on this minimum).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

let db;

function dbPath() {
  return process.env.ROLESCORE_DB_PATH || join(careerOpsRoot(), "data", "rolescore.db");
}

function migrate(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resumes (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      label TEXT,
      base_url TEXT,
      model TEXT,
      encrypted_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      key_id TEXT,
      jd_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      score REAL,
      verdict TEXT,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_user ON evaluations(user_id, created_at DESC);
  `);
}

/** One shared, lazily-opened connection per process (Next.js dev/prod server is long-lived). */
export function getDb() {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}
