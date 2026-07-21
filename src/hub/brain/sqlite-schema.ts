export const BRAIN_SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS artifact_fts USING fts5(
  artifact_id UNINDEXED,
  title,
  content,
  type,
  provenance,
  tokenize = 'unicode61'
);
CREATE TABLE IF NOT EXISTS audit_events (
  sequence TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY (actor_id, request_id)
);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  link_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS links_source_idx ON links(source_artifact_id);
CREATE INDEX IF NOT EXISTS links_target_idx ON links(target_artifact_id);
`;
