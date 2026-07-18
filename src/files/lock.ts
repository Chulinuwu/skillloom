import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { LockError } from "../domain/errors.js";
import type { LockDiagnostic } from "../operations/types.js";
import { storeLayout } from "../store/layout.js";
import { readLockOwnerDiagnostic, readLockToken, writeLockOwner, type LockOwner } from "./lock-owner.js";
import { syncDirectory } from "./durability.js";

export type StoreLockContext = Pick<LockOwner, "operationId" | "context">;

export async function withStoreLock<T>(
  root: string,
  fn: () => Promise<T>,
  owner: StoreLockContext = { operationId: "op-unknown", context: "store-mutation" }
): Promise<T> {
  const layout = storeLayout(root);
  const token = randomUUID();
  let acquired = false;
  try {
    await mkdir(layout.lock);
    acquired = true;
    await writeLockOwner(layout.lock, { ...owner, pid: process.pid, createdAt: new Date().toISOString(), token });
  } catch {
    if (acquired) {
      await rm(layout.lock, { recursive: true, force: true });
    }
    throw new LockError(`Skillloom store is locked at ${layout.lock}`);
  }
  try {
    return await fn();
  } finally {
    await releaseOwnedLock(layout.lock, token);
  }
}

export async function readLockDiagnostic(root: string): Promise<LockDiagnostic> {
  return await readLockOwnerDiagnostic(storeLayout(root).lock);
}

export async function withRecoveryStoreLock<T>(
  root: string,
  fn: () => Promise<T>,
  owner: StoreLockContext
): Promise<T> {
  const diagnostic = await readLockDiagnostic(root);
  if (diagnostic.state === "stale") {
    if (diagnostic.operationId && diagnostic.operationId !== owner.operationId) {
      throw new LockError(`Stale lock belongs to ${diagnostic.operationId}, not ${owner.operationId}`);
    }
    const layout = storeLayout(root);
    const archive = join(layout.root, "stale-locks");
    await mkdir(archive, { recursive: true });
    await rename(layout.lock, join(archive, `${owner.operationId}-${Date.now()}`));
    await syncDirectory(layout.root);
    await syncDirectory(archive);
  } else if (diagnostic.state !== "unlocked") {
    throw new LockError(`Skillloom store is locked at ${diagnostic.path}`);
  }
  return await withStoreLock(root, fn, owner);
}

async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  if (await readLockToken(lockPath) !== token) {
    throw new LockError(`Skillloom lock ownership changed before release at ${lockPath}`);
  }
  await rm(lockPath, { recursive: true });
}
