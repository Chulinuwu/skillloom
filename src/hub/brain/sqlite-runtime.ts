import { BrainStorageCorruptionError } from "./errors.js";

export interface BrainSqliteStatement {
  run(...parameters: unknown[]): unknown;
  get(...parameters: unknown[]): unknown;
  all(...parameters: unknown[]): unknown[];
}

export interface BrainSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): BrainSqliteStatement;
  close(): void;
}

export async function openBrainSqlite(path: string): Promise<BrainSqliteDatabase> {
  const specifier: string = "node:sqlite";
  const module: unknown = await import(specifier);
  if (!isRecord(module) || typeof module.DatabaseSync !== "function") {
    throw new BrainStorageCorruptionError("The Hub runtime does not provide node:sqlite DatabaseSync");
  }
  const database: unknown = Reflect.construct(module.DatabaseSync, [path]);
  assertDatabase(database);
  return database;
}

function assertDatabase(value: unknown): asserts value is BrainSqliteDatabase {
  if (!isRecord(value)
    || typeof value.exec !== "function"
    || typeof value.prepare !== "function"
    || typeof value.close !== "function") {
    throw new BrainStorageCorruptionError("node:sqlite returned an invalid database adapter");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
