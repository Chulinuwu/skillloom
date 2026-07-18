import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LockDiagnostic } from "../operations/types.js";
import { atomicWriteJson } from "./atomic-write.js";


export type LockOwner = {
  pid: number;
  createdAt: string;
  operationId: string;
  context: string;
  token?: string;
};

export async function writeLockOwner(lockPath: string, owner: LockOwner): Promise<void> {
  await atomicWriteJson(join(lockPath, "lock.json"), owner);
}

export async function readLockOwnerDiagnostic(lockPath: string): Promise<LockDiagnostic> {
  try {
    await lstat(lockPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { state: "unlocked" };
    }
    throw error;
  }
  try {
    const value: unknown = JSON.parse(await readFile(join(lockPath, "lock.json"), "utf8"));
    if (!isLockOwnerBase(value)) {
      return { state: "invalid", path: lockPath, action: "Inspect invalid lock metadata" };
    }
    const stale = !processExists(value.pid);
    return {
      state: stale ? "stale" : "active",
      path: lockPath,
      pid: value.pid,
      createdAt: value.createdAt,
      operationId: optionalString(value, "operationId"),
      context: optionalString(value, "context"),
      action: stale ? "Inspect stale lock metadata and use the operation recovery command reported by status" : "Wait for the active operation to finish"
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT" || error instanceof SyntaxError) {
      return { state: "invalid", path: lockPath, action: "Inspect invalid lock metadata" };
    }
    throw error;
  }
}

export async function readLockToken(lockPath: string): Promise<string | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(lockPath, "lock.json"), "utf8"));
    return isLockOwnerBase(value) ? optionalString(value, "token") : undefined;
  } catch (error) {
    if (errorCode(error) === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function isLockOwnerBase(value: unknown): value is { pid: number; createdAt: string } & Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "pid" in value && typeof value.pid === "number" && Number.isInteger(value.pid) && value.pid > 0
    && "createdAt" in value && typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt));
}
function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
