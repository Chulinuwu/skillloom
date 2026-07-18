import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout } from "node:timers/promises";
import { JournalCorruptionError, LockError } from "../domain/errors.js";
import type { JournalEvent } from "../domain/types.js";
import { syncDirectory } from "../files/durability.js";
import { readLockOwnerDiagnostic, writeLockOwner } from "../files/lock-owner.js";
import { storeLayout } from "./layout.js";

const journalQueues = new Map<string, Promise<unknown>>();

export type JournalHealth =
  | { state: "healthy"; events: number }
  | { state: "malformed" | "truncated" | "sequence"; validEvents: number; message: string; recoveryCommand: null };

export async function appendEvent(root: string, event: Omit<JournalEvent, "sequence" | "timestamp">, afterLockAcquired?: () => void | Promise<void>): Promise<JournalEvent> {
  return await withJournalQueue(root, async () => appendEventUnlocked(root, event, afterLockAcquired));
}

async function appendEventUnlocked(root: string, event: Omit<JournalEvent, "sequence" | "timestamp">, afterLockAcquired?: () => void | Promise<void>): Promise<JournalEvent> {
  const layout = storeLayout(root);
  await mkdir(dirname(layout.events), { recursive: true });
  await acquireJournalLock(layout.journalLock, event.operationId, `${event.kind}:${event.phase}`);
  try {
    await afterLockAcquired?.();
    const sequence = await nextSequence(layout.events);
    const record = { sequence, timestamp: new Date().toISOString(), ...redactEvent(event) };
    const handle = await open(layout.events, "a");
    try {
      await handle.appendFile(`${JSON.stringify(record)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return record;
  } finally {
    await rm(layout.journalLock, { recursive: true, force: true });
    await syncDirectory(dirname(layout.journalLock));
  }
}

export async function readEvents(root: string): Promise<JournalEvent[]> {
  return await readEventFile(storeLayout(root).events);
}

export async function inspectJournal(root: string): Promise<{ events: JournalEvent[]; health: JournalHealth }> {
  try {
    const events = await readEvents(root);
    return { events, health: { state: "healthy", events: events.length } };
  } catch (error) {
    if (error instanceof JournalCorruptionError) {
      return {
        events: [],
        health: {
          state: error.corruption,
          validEvents: error.validEvents,
          message: error.message,
          recoveryCommand: null
        }
      };
    }
    throw error;
  }
}

export async function readJournalLockDiagnostic(root: string) {
  return await readLockOwnerDiagnostic(storeLayout(root).journalLock);
}

async function readEventFile(path: string): Promise<JournalEvent[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (text.length === 0) {
    return [];
  }
  const terminated = text.endsWith("\n");
  const lines = text.split("\n");
  if (terminated) {
    lines.pop();
  }
  const events: JournalEvent[] = [];
  for (const [index, line] of lines.entries()) {
    if (!line) {
      throw new JournalCorruptionError(`Journal is corrupt at line ${index + 1}`, "malformed", events.length);
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      const trailing = index === lines.length - 1 && !terminated;
      throw new JournalCorruptionError(
        trailing ? `Journal has a truncated trailing record at line ${index + 1}` : `Journal is corrupt at line ${index + 1}`,
        trailing ? "truncated" : "malformed",
        events.length
      );
    }
    if (!isJournalEvent(value)) {
      throw new JournalCorruptionError(`Journal is corrupt at line ${index + 1}`, "malformed", events.length);
    }
    if (value.sequence !== events.length + 1) {
      throw new JournalCorruptionError(`Journal sequence mismatch at line ${index + 1}`, "sequence", events.length);
    }
    events.push(value);
  }
  if (!terminated) {
    throw new JournalCorruptionError(`Journal has a truncated trailing record at line ${lines.length}`, "truncated", Math.max(0, events.length - 1));
  }
  return events;
}

async function nextSequence(path: string): Promise<number> {
  return (await readEventFile(path)).length + 1;
}

function isJournalEvent(value: unknown): value is JournalEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "sequence" in value && typeof value.sequence === "number" && Number.isInteger(value.sequence) && value.sequence > 0
    && "timestamp" in value && typeof value.timestamp === "string" && !Number.isNaN(Date.parse(value.timestamp))
    && "operationId" in value && typeof value.operationId === "string"
    && "kind" in value && typeof value.kind === "string"
    && "phase" in value && typeof value.phase === "string";
}

function redactEvent<T>(event: T): T {
  return JSON.parse(JSON.stringify(event), (_key, value: unknown) => {
    if (typeof value === "string" && /(transcript|OPENAI_API_KEY|sk-)/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }) as T;
}

async function withJournalQueue<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = journalQueues.get(root) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveRelease) => {
    release = resolveRelease;
  });
  const queued = previous.then(() => current, () => current);
  journalQueues.set(root, queued);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (journalQueues.get(root) === queued) {
      journalQueues.delete(root);
    }
  }
}

async function acquireJournalLock(path: string, operationId: string, context: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let acquired = false;
    try {
      await mkdir(path);
      acquired = true;
      await writeLockOwner(path, { pid: process.pid, createdAt: new Date().toISOString(), operationId, context });
      return;
    } catch (error) {
      if (acquired) {
        await rm(path, { recursive: true, force: true });
      }
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
      await setTimeout(5);
    }
  }
  throw new LockError(`Skillloom journal is locked at ${path}`);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
