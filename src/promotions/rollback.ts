import { randomUUID } from "node:crypto";
import { OperationInterruptedError, PromotionPolicyError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import { withStoreLock } from "../files/lock.js";
import type { RollbackOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";
import { readPromotion } from "../store/promotions.js";
import { cleanupRollbackPaths } from "./_rollback-cleanup.js";
import { buildRollbackTargets, stageRollbackTargets } from "./_rollback-prepare.js";
import { commitRollbackTargets } from "./_rollback-transaction.js";
import { verifyRolledBackState } from "./_rollback-validation.js";
import type { RollbackApproval, RollbackHooks } from "./rollback-types.js";

export type { RollbackApproval, RollbackHooks } from "./rollback-types.js";

export async function rollbackPromotion(
  root: string,
  promotionId: string,
  approval: RollbackApproval,
  hooks: RollbackHooks = {}
): Promise<PromotionRecord> {
  if (!approval.yes) {
    throw new PromotionPolicyError("Rollback requires explicit approval with --yes");
  }
  const promotion = await readPromotion(root, promotionId);
  if (promotion.result === "rolled-back") {
    await verifyRolledBackState(promotion);
    return promotion;
  }
  if (promotion.result !== "applied") {
    throw new PromotionPolicyError(`Cannot roll back a ${promotion.result} promotion`);
  }
  const operationId = `op-rollback-${randomUUID()}`;
  return await withStoreLock(root, async () => {
    const now = new Date().toISOString();
    const targets = await buildRollbackTargets(promotion, approval, operationId);
    let checkpoint: RollbackOperation = {
      kind: "rollback",
      operationId,
      promotionId,
      createdAt: now,
      updatedAt: now,
      status: "in-progress",
      phase: "intent",
      recoveryAction: "Preparation has not reached a resumable checkpoint",
      force: approval.force,
      targets
    };
    await writeOperation(root, checkpoint);
    await appendEvent(root, { operationId, kind: "rollback", phase: "started", evidence: { promotionId, force: approval.force } });
    try {
      await stageRollbackTargets(targets);
      checkpoint = {
        ...checkpoint,
        phase: "prepared",
        updatedAt: new Date().toISOString(),
        recoveryAction: `skillloom resume ${operationId} --yes`
      };
      await writeOperation(root, checkpoint);
      try {
        await hooks.afterPreparedCheckpoint?.(checkpoint);
      } catch (error) {
        const message = errorMessage(error);
        checkpoint = { ...checkpoint, status: "interrupted", updatedAt: new Date().toISOString(), error: message };
        await writeOperation(root, checkpoint);
        await appendEvent(root, { operationId, kind: "rollback", phase: "interrupted", evidence: { phase: "prepared" }, error: message });
        throw new OperationInterruptedError(message);
      }
    } catch (error) {
      if (error instanceof OperationInterruptedError) {
        throw error;
      }
      await cleanupRollbackPaths(targets.flatMap((target) => target.stagePath ? [target.stagePath] : []));
      await failRollback(root, checkpoint, error);
      throw error;
    }
    return (await commitRollbackTargets(root, promotion, checkpoint, hooks)).promotion;
  }, { operationId, context: "rollback" });
}

async function failRollback(root: string, checkpoint: RollbackOperation, error: unknown): Promise<void> {
  const message = errorMessage(error);
  await writeOperation(root, {
    ...checkpoint,
    status: "failed",
    recoveryAction: "Preparation failed before a resumable checkpoint",
    updatedAt: new Date().toISOString(),
    error: message
  });
  await appendEvent(root, { operationId: checkpoint.operationId, kind: "rollback", phase: "failed", error: message });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
