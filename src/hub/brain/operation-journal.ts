import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "../../files/atomic-write.js";
import { syncDirectory } from "../../files/durability.js";
import { brainLayout } from "./layout.js";
import type { BrainOperationJournalPort } from "./ports.js";
import type { BrainPendingOperation } from "./types.js";
import { parseBrainPendingOperation, validateArtifactId } from "./validation.js";

export class FileBrainOperationJournal implements BrainOperationJournalPort {
  private readonly directory: string;

  constructor(root: string) {
    this.directory = brainLayout(root).pending;
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async write(operation: BrainPendingOperation): Promise<void> {
    validateArtifactId(operation.operationId);
    await atomicWriteJson(this.path(operation.operationId), operation, { mode: 0o600 });
  }

  async list(): Promise<BrainPendingOperation[]> {
    const operations: BrainPendingOperation[] = [];
    for (const entry of (await readdir(this.directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const value: unknown = JSON.parse(await readFile(join(this.directory, entry.name), "utf8"));
      operations.push(parseBrainPendingOperation(value));
    }
    return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.operationId.localeCompare(right.operationId));
  }

  async remove(operationId: string): Promise<void> {
    await rm(this.path(operationId), { force: true });
    await syncDirectory(this.directory);
  }

  private path(operationId: string): string {
    validateArtifactId(operationId);
    return join(this.directory, `${operationId}.json`);
  }
}
