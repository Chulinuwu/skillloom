import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OperationRecord } from "../operations/types.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { storeLayout } from "./layout.js";

export async function writeOperation(root: string, operation: OperationRecord): Promise<void> {
  await mkdir(storeLayout(root).operations, { recursive: true });
  await atomicWriteJson(operationPath(root, operation.operationId), operation);
}

export async function readOperation(root: string, operationId: string): Promise<OperationRecord> {
  return JSON.parse(await readFile(operationPath(root, operationId), "utf8")) as OperationRecord;
}

export async function listOperations(root: string): Promise<OperationRecord[]> {
  try {
    const files = (await readdir(storeLayout(root).operations)).filter((file) => file.endsWith(".json")).sort();
    return await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(storeLayout(root).operations, file), "utf8")) as OperationRecord));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function operationPath(root: string, operationId: string): string {
  if (!/^op-[a-z]+-[a-zA-Z0-9-]+$/.test(operationId)) {
    throw new Error(`Invalid operation ID: ${operationId}`);
  }
  return join(storeLayout(root).operations, `${operationId}.json`);
}
