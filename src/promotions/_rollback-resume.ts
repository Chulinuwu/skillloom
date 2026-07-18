import { basename, dirname, join } from "node:path";
import { PromotionPolicyError, PromotionTransactionError, ValidationError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import { observeMutation } from "../operations/mutation-layout.js";
import type { RollbackOperation } from "../operations/types.js";
import { readOperation } from "../store/operations.js";
import { readPromotion } from "../store/promotions.js";
import { hashSkillDirectory, pathExists } from "./files.js";
import { commitRollbackTargets } from "./_rollback-transaction.js";

export async function resumeRollback(root: string, stored: RollbackOperation): Promise<PromotionRecord> {
  const promotion = await readPromotion(root, stored.promotionId);
  if (promotion.result === "rolled-back") {
    return promotion;
  }
  if (promotion.result !== "applied") {
    throw new PromotionPolicyError(`Rollback cannot resume from promotion result ${promotion.result}`);
  }
  await verifyRollbackCheckpoint(stored, promotion);
  try {
    return (await commitRollbackTargets(root, promotion, stored, {})).promotion;
  } catch (error) {
    if (stored.phase === "compensating" && error instanceof PromotionTransactionError) {
      const operation = await readOperation(root, stored.operationId);
      if (operation.kind === "rollback" && operation.status === "completed" && operation.phase === "compensated") {
        return await readPromotion(root, stored.promotionId);
      }
    }
    throw error;
  }
}

async function verifyRollbackCheckpoint(
  checkpoint: RollbackOperation,
  promotion: Extract<PromotionRecord, { result: "applied" }>
): Promise<void> {
  if (checkpoint.targets.length !== promotion.targets.length) {
    throw new ValidationError("Rollback resume target count mismatch");
  }
  for (const [index, target] of checkpoint.targets.entries()) {
    const record = promotion.targets[index];
    if (!record || record.destination !== target.destination || record.afterHash !== target.afterHash || JSON.stringify(record.before) !== JSON.stringify(target.before)) {
      throw new ValidationError(`Rollback resume evidence mismatch at target ${index}`);
    }
    const prefix = `.${basename(target.destination)}.skillloom-${checkpoint.operationId}`;
    const expectedStage = target.before.kind === "present" ? join(dirname(target.destination), `${prefix}.stage`) : null;
    if (target.stagePath !== expectedStage || target.displacedPath !== join(dirname(target.destination), `${prefix}.previous`)) {
      throw new ValidationError(`Rollback resume temporary path mismatch: ${target.destination}`);
    }
    if (target.before.kind === "present") {
      if (!await pathExists(target.before.backupPath) || await hashSkillDirectory(target.before.backupPath) !== target.before.hash) {
        throw new ValidationError(`Rollback resume backup hash mismatch: ${target.destination}`);
      }
    }
    if (target.stagePath && await pathExists(target.stagePath) && target.before.kind === "present" && await hashSkillDirectory(target.stagePath) !== target.before.hash) {
      throw new ValidationError(`Rollback resume staged hash mismatch: ${target.destination}`);
    }
    await observeMutation(target, {
      beforeHash: target.activeHash,
      afterHash: target.before.kind === "present" ? target.before.hash : null
    }, target.state);
  }
}
