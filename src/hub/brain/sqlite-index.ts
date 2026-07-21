import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BrainStorageCorruptionError } from "./errors.js";
import { brainLayout } from "./layout.js";
import type { BrainMetadataIndex } from "./ports.js";
import { BRAIN_SQLITE_SCHEMA } from "./sqlite-schema.js";
import { openBrainSqlite, type BrainSqliteDatabase, type BrainSqliteStatement } from "./sqlite-runtime.js";
import type {
  BrainArtifact,
  BrainArtifactMetadata,
  BrainArtifactType,
  BrainAuditEvent,
  BrainIdempotencyRecord,
  BrainLink,
  BrainPendingOperation,
  BrainSearchResult
} from "./types.js";
import { parseBrainArtifactMetadata, parseBrainMutationResult, withoutContent } from "./validation.js";

export class SqliteBrainMetadataIndex implements BrainMetadataIndex {
  private readonly path: string;
  private database: BrainSqliteDatabase | null = null;

  constructor(root: string) {
    this.path = brainLayout(root).sqlite;
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    this.database = await openBrainSqlite(this.path);
    this.database.exec(BRAIN_SQLITE_SCHEMA);
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = null;
  }

  async getIdempotency(actorId: string, requestId: string): Promise<BrainIdempotencyRecord | null> {
    const row = this.statement("SELECT payload_hash, result_json FROM idempotency WHERE actor_id = ? AND request_id = ?").get(actorId, requestId);
    if (row === undefined) {
      return null;
    }
    const record = rowRecord(row);
    return {
      actorId,
      requestId,
      payloadHash: textColumn(record, "payload_hash"),
      result: parseBrainMutationResult(JSON.parse(textColumn(record, "result_json")))
    };
  }

  async getArtifactMetadata(artifactId: string): Promise<BrainArtifactMetadata | null> {
    const row = this.statement("SELECT metadata_json FROM artifacts WHERE id = ?").get(artifactId);
    if (row === undefined) {
      return null;
    }
    return parseBrainArtifactMetadata(JSON.parse(textColumn(rowRecord(row), "metadata_json")));
  }

  async commit(operation: BrainPendingOperation, event: BrainAuditEvent): Promise<void> {
    this.transaction(() => {
      if (operation.action === "link") {
        this.upsertLink(operation.link);
      } else {
        this.upsertArtifact(operation.artifact);
      }
      this.insertEvent(event);
      this.insertIdempotency(event);
    });
  }

  async rebuild(artifacts: BrainArtifact[], events: BrainAuditEvent[]): Promise<void> {
    this.transaction(() => {
      this.databaseOrThrow().exec("DELETE FROM artifact_fts; DELETE FROM artifacts; DELETE FROM links; DELETE FROM audit_events; DELETE FROM idempotency;");
      for (const artifact of artifacts) {
        this.upsertArtifact(artifact);
      }
      for (const event of events) {
        if (event.result.kind === "link") {
          this.upsertLink(event.result.link);
        }
        this.insertEvent(event);
        this.insertIdempotency(event);
      }
    });
  }

  async search(query: string, type: BrainArtifactType | undefined, limit: number): Promise<BrainSearchResult[]> {
    const ftsQuery = toFtsQuery(query);
    const rows = this.statement(`
      SELECT a.metadata_json, snippet(artifact_fts, 2, '', '', ' ... ', 18) AS excerpt
      FROM artifact_fts
      JOIN artifacts a ON a.id = artifact_fts.artifact_id
      WHERE artifact_fts MATCH ? AND (? IS NULL OR a.type = ?)
      ORDER BY bm25(artifact_fts), a.updated_at DESC, a.id ASC
      LIMIT ?
    `).all(ftsQuery, type ?? null, type ?? null, limit);
    return rows.map((row) => {
      const record = rowRecord(row);
      return {
        ...parseBrainArtifactMetadata(JSON.parse(textColumn(record, "metadata_json"))),
        excerpt: textColumn(record, "excerpt")
      };
    });
  }

  async links(artifactId: string): Promise<BrainLink[]> {
    return this.statement(`
      SELECT link_json FROM links
      WHERE source_artifact_id = ? OR target_artifact_id = ?
      ORDER BY id ASC
    `).all(artifactId, artifactId).map((row) => parseLink(JSON.parse(textColumn(rowRecord(row), "link_json"))));
  }

  private upsertArtifact(artifact: BrainArtifact): void {
    const metadata = withoutContent(artifact);
    this.statement("DELETE FROM artifact_fts WHERE artifact_id = ?").run(artifact.id);
    this.statement(`
      INSERT INTO artifacts (
        id, path, revision, content_hash, type, title, sensitivity,
        provenance_json, metadata_json, content, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        revision = excluded.revision,
        content_hash = excluded.content_hash,
        type = excluded.type,
        title = excluded.title,
        sensitivity = excluded.sensitivity,
        provenance_json = excluded.provenance_json,
        metadata_json = excluded.metadata_json,
        content = excluded.content,
        updated_at = excluded.updated_at
    `).run(
      artifact.id,
      artifact.path,
      artifact.revision,
      artifact.contentHash,
      artifact.type,
      artifact.title,
      artifact.sensitivity,
      JSON.stringify(artifact.provenance),
      JSON.stringify(metadata),
      artifact.content,
      artifact.updatedAt
    );
    this.statement("INSERT INTO artifact_fts (artifact_id, title, content, type, provenance) VALUES (?, ?, ?, ?, ?)")
      .run(artifact.id, artifact.title, artifact.content, artifact.type, JSON.stringify(artifact.provenance));
  }

  private upsertLink(link: BrainLink): void {
    this.statement(`
      INSERT INTO links (id, source_artifact_id, target_artifact_id, relationship, link_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET link_json = excluded.link_json
    `).run(link.id, link.sourceArtifactId, link.targetArtifactId, link.relationship, JSON.stringify(link));
  }

  private insertEvent(event: BrainAuditEvent): void {
    this.statement("INSERT OR IGNORE INTO audit_events (sequence, event_id, event_json) VALUES (?, ?, ?)")
      .run(event.sequence, event.eventId, JSON.stringify(event));
  }

  private insertIdempotency(event: BrainAuditEvent): void {
    this.statement(`
      INSERT OR IGNORE INTO idempotency (actor_id, request_id, payload_hash, result_json)
      VALUES (?, ?, ?, ?)
    `).run(event.actor.actorId, event.requestId, event.payloadHash, JSON.stringify(event.result));
  }

  private statement(sql: string): BrainSqliteStatement {
    const statement: unknown = this.databaseOrThrow().prepare(sql);
    if (!isRecord(statement)
      || typeof statement.run !== "function"
      || typeof statement.get !== "function"
      || typeof statement.all !== "function") {
      throw new BrainStorageCorruptionError("node:sqlite returned an invalid statement");
    }
    const run = statement.run;
    const get = statement.get;
    const all = statement.all;
    return {
      run(...parameters: unknown[]) {
        return Reflect.apply(run, statement, parameters);
      },
      get(...parameters: unknown[]) {
        return Reflect.apply(get, statement, parameters);
      },
      all(...parameters: unknown[]) {
        const rows: unknown = Reflect.apply(all, statement, parameters);
        if (!Array.isArray(rows)) {
          throw new BrainStorageCorruptionError("node:sqlite returned malformed rows");
        }
        return rows;
      }
    };
  }

  private databaseOrThrow(): BrainSqliteDatabase {
    if (!this.database) {
      throw new BrainStorageCorruptionError("Brain SQLite index is not initialized");
    }
    return this.database;
  }

  private transaction(fn: () => void): void {
    const database = this.databaseOrThrow();
    database.exec("BEGIN IMMEDIATE");
    try {
      fn();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function toFtsQuery(query: string): string {
  const tokens = query.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (tokens.length === 0) {
    throw new BrainStorageCorruptionError("Search query contains no indexable terms");
  }
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");
}

function parseLink(value: unknown): BrainLink {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.sourceArtifactId !== "string"
    || typeof value.targetArtifactId !== "string"
    || typeof value.relationship !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.createdBy !== "string") {
    throw new BrainStorageCorruptionError("Brain link index row is malformed");
  }
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}

function rowRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BrainStorageCorruptionError("Brain SQLite row is malformed");
  }
  return value;
}

function textColumn(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new BrainStorageCorruptionError(`Brain SQLite column ${column} is malformed`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
