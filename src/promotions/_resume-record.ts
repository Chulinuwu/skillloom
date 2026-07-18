import { ValidationError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import type { PromotionOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";
import { readPromotion, writePromotionRecord } from "../store/promotions.js";
import { discardPromotionPath, hashSkillDirectory, pathExists } from "./files.js";
import { toResumeRecord } from "./_resume-validation.js";

export async function recoverRecordedPromotion(root: string, checkpoint: PromotionOperation): Promise<PromotionRecord | null> {
  let record: PromotionRecord;
  try {
    record = await readPromotion(root, checkpoint.promotionId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (record.operationId !== checkpoint.operationId || record.candidateId !== checkpoint.candidateId || JSON.stringify(record.targets) !== JSON.stringify(checkpoint.targets.map(toResumeRecord))) {
    throw new ValidationError("Recorded promotion does not agree with the resume checkpoint");
  }
  if (record.result === "applied") {
    for (const target of record.targets) {
      if (!await pathExists(target.destination) || await hashSkillDirectory(target.destination, target.afterHash) !== target.afterHash) {
        throw new ValidationError(`Recorded promotion active hash mismatch: ${target.destination}`);
      }
    }
    if (record.cleanup.status === "pending") {
      const warnings: string[] = [];
      for (const target of checkpoint.targets) {
        try {
          await discardPromotionPath(target.displacedPath);
        } catch (error) {
          warnings.push(`${target.displacedPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      record = { ...record, cleanup: warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings } };
      await writePromotionRecord(root, record);
    }
  }
  await writeOperation(root, {
    ...checkpoint,
    phase: record.result === "compensated" ? "compensated" : "applied",
    status: "completed",
    recoveryAction: "None",
    updatedAt: new Date().toISOString()
  });
  await appendEvent(root, {
    operationId: checkpoint.operationId,
    kind: "resume",
    phase: "completed",
    evidence: { promotionId: checkpoint.promotionId, recoveredRecord: record.result }
  });
  return record;
}
