import { lstat, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { LockError } from "../domain/errors.js";
import { syncDirectory } from "../files/durability.js";
import { inspectJournal, readJournalLockDiagnostic } from "./journal.js";
import { storeLayout } from "./layout.js";

export async function recoverStaleJournalLock(root: string, expectedOperationId?: string) {
  const journal = await inspectJournal(root);
  if (journal.health.state !== "healthy") {
    throw new LockError(`Journal lock recovery requires a healthy journal: ${journal.health.state}`);
  }
  const diagnostic = await readJournalLockDiagnostic(root);
  if (diagnostic.state !== "stale") {
    throw new LockError(`Journal lock is ${diagnostic.state}, not stale`);
  }
  if (expectedOperationId && diagnostic.operationId !== expectedOperationId) {
    throw new LockError(`Journal lock belongs to ${diagnostic.operationId ?? "an unknown operation"}, not ${expectedOperationId}`);
  }
  const layout = storeLayout(root);
  const archiveRoot = join(layout.root, "stale-locks", "journal");
  await mkdir(archiveRoot, { recursive: true });
  const archivedPath = await nextArchivePath(archiveRoot, `${diagnostic.operationId ?? "unknown"}-${Date.now()}`);
  await rename(layout.journalLock, archivedPath);
  await syncDirectory(layout.root);
  await syncDirectory(archiveRoot);
  return { archivedPath, owner: diagnostic };
}

async function nextArchivePath(root: string, name: string): Promise<string> {
  for (let suffix = 0; ; suffix += 1) {
    const path = join(root, suffix === 0 ? name : `${name}-${suffix}`);
    try {
      await lstat(path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return path;
      }
      throw error;
    }
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
