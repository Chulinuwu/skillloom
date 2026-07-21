import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "../../files/atomic-write.js";
import { syncDirectory } from "../../files/durability.js";
import { registryLayout } from "./registry-layout.js";
import { parseRegistryPendingOperation } from "./server-schema.js";
import type { RegistryPendingOperation } from "./server-types.js";

export class FileRegistryOperationJournal {
  private readonly layout;

  constructor(root: string) {
    this.layout = registryLayout(root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.layout.pending, { recursive: true });
  }

  async write(operation: RegistryPendingOperation): Promise<void> {
    await atomicWriteJson(this.layout.operation(operation.operationId), operation, { mode: 0o600 });
  }

  async list(): Promise<RegistryPendingOperation[]> {
    const operations: RegistryPendingOperation[] = [];
    for (const entry of await readdir(this.layout.pending, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const value: unknown = JSON.parse(await readFile(join(this.layout.pending, entry.name), "utf8"));
      operations.push(parseRegistryPendingOperation(value));
    }
    return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.operationId.localeCompare(right.operationId));
  }

  async remove(operationId: string): Promise<void> {
    await rm(this.layout.operation(operationId), { force: true });
    await syncDirectory(this.layout.pending);
  }
}
