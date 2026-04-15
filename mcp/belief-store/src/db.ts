import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Shared SQLite helpers for the belief-store MCP server and the PostToolUse
 * hook. Both open the same file in WAL mode so concurrent reads + the
 * occasional hook write do not block each other.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS predictions (
  action_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id          TEXT    NOT NULL,
  action           TEXT    NOT NULL,
  expected         TEXT    NOT NULL,
  confidence       REAL    NOT NULL DEFAULT 0.5,
  tool_name        TEXT,
  tool_input_hash  TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  actual           TEXT,
  surprise_score   REAL,
  observed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_predictions_task
  ON predictions(task_id);

CREATE INDEX IF NOT EXISTS idx_predictions_tool_hash
  ON predictions(tool_name, tool_input_hash);

CREATE INDEX IF NOT EXISTS idx_predictions_open
  ON predictions(tool_name) WHERE actual IS NULL;

CREATE TABLE IF NOT EXISTS beliefs (
  task_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  precision   REAL NOT NULL DEFAULT 0.5,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, key)
);
`;

export function openDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/**
 * Resolve the belief-store DB path, preferring the explicit env var and
 * falling back to CLAUDE_PLUGIN_DATA (set by the Claude Code plugin
 * loader) or cwd as a last resort for local dev.
 */
export function resolveDbPath(): string {
  const explicit = process.env.BELIEF_DB_PATH;
  if (explicit && explicit.trim()) return explicit;
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData && pluginData.trim()) return `${pluginData}/beliefs.db`;
  return `${process.cwd()}/.predictive-mind-beliefs.db`;
}
