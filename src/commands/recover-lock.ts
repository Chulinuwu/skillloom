import { PromotionPolicyError } from "../domain/errors.js";
import type { Command } from "../domain/types.js";
import { appendEvent } from "../store/journal.js";
import { recoverStaleJournalLock } from "../store/journal-lock-recovery.js";

export async function recoverLockCommand(command: Extract<Command, { command: "recover-lock" }>, root = process.cwd()) {
  if (!command.yes) {
    throw new PromotionPolicyError("Lock recovery requires explicit approval with --yes");
  }
  const recovery = await recoverStaleJournalLock(root);
  await appendEvent(root, {
    operationId: recovery.owner.operationId ?? "op-recovery-journal-lock",
    kind: "recovery",
    phase: "lock-archived",
    evidence: recovery
  });
  return recovery;
}
