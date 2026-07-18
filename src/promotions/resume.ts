import { PromotionPolicyError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import { withRecoveryStoreLock } from "../files/lock.js";
import type { PromotionOperation } from "../operations/types.js";
import { appendEvent, readJournalLockDiagnostic } from "../store/journal.js";
import { recoverStaleJournalLock } from "../store/journal-lock-recovery.js";
import { readOperation } from "../store/operations.js";
import { readPromotion } from "../store/promotions.js";
import { commitPromotionTargets } from "./_commit.js";
import { recoverRecordedPromotion } from "./_resume-record.js";
import { resumeRollback } from "./_rollback-resume.js";
import { toResolvedTarget, toResumeRecord, verifyResumeCheckpoint } from "./_resume-validation.js";

export async function resumePromotion(root: string, operationId: string, yes: boolean): Promise<PromotionRecord> {
  if (!yes) {
    throw new PromotionPolicyError("Resume requires explicit approval with --yes");
  }
  const stored = await readOperation(root, operationId);
  if (stored.kind === "capture") {
    throw new PromotionPolicyError(`Operation is not resumable: ${operationId}`);
  }
  if (stored.status === "completed") {
    return await readPromotion(root, stored.promotionId);
  }
  if ((stored.status !== "interrupted" && stored.status !== "in-progress") || !isResumablePhase(stored)) {
    throw new PromotionPolicyError(`${stored.kind} cannot resume from ${stored.status}/${stored.phase}`);
  }
  return await withRecoveryStoreLock(root, async () => {
    const journalLock = await readJournalLockDiagnostic(root);
    if (journalLock.state === "stale") {
      const recovery = await recoverStaleJournalLock(root, operationId);
      await appendEvent(root, { operationId, kind: "recovery", phase: "lock-archived", evidence: recovery });
    }
    await appendEvent(root, {
      operationId,
      kind: "resume",
      phase: "started",
      evidence: { promotionId: stored.promotionId, resumedPhase: stored.phase, operationKind: stored.kind }
    });
    try {
      const result = stored.kind === "promote" ? await resumePromotionLocked(root, stored) : await resumeRollback(root, stored);
      await appendEvent(root, {
        operationId,
        kind: "resume",
        phase: "completed",
        evidence: { promotionId: stored.promotionId, result: result.result }
      });
      return result;
    } catch (error) {
      await appendEvent(root, {
        operationId,
        kind: "resume",
        phase: "failed",
        evidence: { recoveryAction: stored.recoveryAction },
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }, { operationId, context: `resume-${stored.kind}` });
}

async function resumePromotionLocked(root: string, stored: PromotionOperation): Promise<PromotionRecord> {
  const recorded = await recoverRecordedPromotion(root, stored);
  if (recorded) {
    return recorded;
  }
  const checkpoint = await verifyResumeCheckpoint(root, stored);
  return (await commitPromotionTargets(
    root,
    checkpoint,
    checkpoint.targets.map(toResumeRecord),
    checkpoint.targets.map(toResolvedTarget),
    {}
  )).promotion;
}

function isResumablePhase(operation: Exclude<Awaited<ReturnType<typeof readOperation>>, { kind: "capture" }>): boolean {
  return operation.phase === "prepared" || operation.phase === "committing" || operation.phase === "compensating";
}
