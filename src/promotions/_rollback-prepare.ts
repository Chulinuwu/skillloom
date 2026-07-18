import { basename, dirname, join } from "node:path";
import { PromotionPolicyError, ValidationError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import { stageCanonicalSkill } from "./files.js";
import { activeHashAt, verifyBackup } from "./_rollback-validation.js";
import type { PreparedRollbackTarget, RollbackApproval } from "./rollback-types.js";

export async function buildRollbackTargets(
  promotion: Extract<PromotionRecord, { result: "applied" }>,
  approval: RollbackApproval,
  operationId: string
): Promise<PreparedRollbackTarget[]> {
  return await Promise.all(promotion.targets.map(async (target) => {
    const activeHash = await activeHashAt(target.destination);
    if (!approval.force && activeHash !== target.afterHash) {
      throw new PromotionPolicyError(`Rollback active hash mismatch at ${target.destination}`);
    }
    const temporaryPrefix = `.${basename(target.destination)}.skillloom-${operationId}`;
    return {
      destination: target.destination,
      stagePath: target.before.kind === "present" ? join(dirname(target.destination), `${temporaryPrefix}.stage`) : null,
      displacedPath: join(dirname(target.destination), `${temporaryPrefix}.previous`),
      afterHash: target.afterHash,
      before: target.before,
      activeHash,
      state: "prepared"
    };
  }));
}

export async function stageRollbackTargets(targets: PreparedRollbackTarget[]): Promise<void> {
  for (const target of targets) {
    if (target.before.kind === "present" && target.stagePath) {
      await verifyBackup(target.before, target.destination);
      const stagedHash = await stageCanonicalSkill(target.before.backupPath, target.stagePath);
      if (stagedHash !== target.before.hash) {
        throw new ValidationError(`Rollback staged hash mismatch at ${target.destination}`);
      }
    }
  }
}
