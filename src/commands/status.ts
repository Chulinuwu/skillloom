import type { Command } from "../domain/types.js";
import { readLockDiagnostic } from "../files/lock.js";
import { inspectOperationRecovery } from "../operations/status.js";
import { listCandidates } from "../store/candidates.js";
import { inspectJournal, readJournalLockDiagnostic } from "../store/journal.js";
import { listOperations } from "../store/operations.js";
import { listPromotions } from "../store/promotions.js";
import { readConfig } from "../config/service.js";
import { listLearningEvents } from "../store/learning.js";

export async function statusCommand(_command: Extract<Command, { command: "status" }>, projectRoot = process.cwd()) {
  const operations = (await listOperations(projectRoot)).filter((operation) => operation.status !== "completed");
  const journal = await inspectJournal(projectRoot);
  const journalLock = await readJournalLockDiagnostic(projectRoot);
  const recovery = (await Promise.all(operations.map(inspectOperationRecovery)))
    .filter((item) => item !== null)
    .map((item) => {
      const journalAvailable = journalLock.state === "unlocked"
        || journalLock.state === "stale" && journalLock.operationId === item.operationId;
      return journal.health.state === "healthy" && journalAvailable ? item : { ...item, recoveryCommand: null };
    });
  const lock = await readLockDiagnostic(projectRoot);
  const lockRecovery = lock.state === "stale" && lock.operationId
    ? recovery.find((item) => item.operationId === lock.operationId)?.recoveryCommand
    : null;
  return {
    mode: (await readConfig(projectRoot))?.mode ?? "manual",
    learning: await listLearningEvents(projectRoot),
    candidates: await listCandidates(projectRoot),
    promotions: await listPromotions(projectRoot),
    events: journal.events,
    journal: journal.health,
    operations,
    recovery,
    lock: lock.state === "stale" && lockRecovery ? { ...lock, action: lockRecovery } : lock,
    journalLock: journalLock.state === "stale"
      ? {
          ...journalLock,
          action: recovery.find((item) => item.operationId === journalLock.operationId)?.recoveryCommand
            ?? (journal.health.state === "healthy" ? "skillloom recover-lock journal --yes" : `Blocked until journal is healthy: ${journal.health.state}`)
        }
      : journalLock
  };
}
