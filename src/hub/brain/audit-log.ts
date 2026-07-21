import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "../../files/durability.js";
import { BrainStorageCorruptionError } from "./errors.js";
import { brainLayout } from "./layout.js";
import type { BrainAuditPort } from "./ports.js";
import type { BrainAuditEvent, BrainAuditEventDraft, BrainMutationResult } from "./types.js";
import { parseBrainAuditEvent } from "./validation.js";

export class JsonlBrainAuditLog implements BrainAuditPort {
  private readonly path: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(root: string) {
    this.path = brainLayout(root).audit;
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
  }

  async append(event: BrainAuditEventDraft, result: BrainMutationResult): Promise<BrainAuditEvent> {
    return await this.enqueue(async () => {
      const events = await this.readAll();
      const existing = events.find((candidate) => candidate.eventId === event.eventId);
      if (existing) {
        if (existing.payloadHash !== event.payloadHash || existing.actor.actorId !== event.actor.actorId || existing.requestId !== event.requestId) {
          throw new BrainStorageCorruptionError(`Audit event ${event.eventId} conflicts with an existing event`);
        }
        return existing;
      }
      const sequence = (events.length === 0 ? 1n : BigInt(events.at(-1)?.sequence ?? "0") + 1n).toString();
      const record: BrainAuditEvent = {
        ...event,
        sequence,
        result: { ...result, eventSequence: sequence }
      };
      const handle = await open(this.path, "a", 0o600);
      try {
        await handle.appendFile(`${JSON.stringify(record)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(dirname(this.path));
      return record;
    });
  }

  async readAll(): Promise<BrainAuditEvent[]> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return [];
      }
      throw error;
    }
    if (text.length === 0) {
      return [];
    }
    if (!text.endsWith("\n")) {
      throw new BrainStorageCorruptionError("Brain audit log has a truncated trailing record");
    }
    const events = text.slice(0, -1).split("\n").map((line) => parseBrainAuditEvent(JSON.parse(line)));
    for (const [index, event] of events.entries()) {
      if (BigInt(event.sequence) !== BigInt(index + 1)) {
        throw new BrainStorageCorruptionError(`Brain audit sequence mismatch at line ${index + 1}`);
      }
    }
    return events;
  }

  async latestSequence(): Promise<string> {
    return (await this.readAll()).at(-1)?.sequence ?? "0";
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
