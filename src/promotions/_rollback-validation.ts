import { basename } from "node:path";
import { ValidationError } from "../domain/errors.js";
import type { PromotionRecord, PromotionTargetBefore } from "../domain/types.js";
import { validateSkillPackage } from "../skills/validate.js";
import { hashSkillDirectory, pathExists } from "./files.js";

export async function verifyBackup(before: Extract<PromotionTargetBefore, { kind: "present" }>, destination: string): Promise<void> {
  if (!await pathExists(before.backupPath)) {
    throw new ValidationError(`Rollback backup is missing: ${before.backupPath}`);
  }
  const validation = await validateSkillPackage(before.backupPath, { expectedName: basename(destination) });
  if (validation.packageHash !== before.hash) {
    throw new ValidationError(`Rollback backup hash mismatch: ${before.backupPath}`);
  }
}

export async function verifyRolledBackState(promotion: Extract<PromotionRecord, { result: "rolled-back" }>): Promise<void> {
  for (const target of promotion.targets) {
    await verifyBeforeState(target.destination, target.before);
  }
}

export async function verifyBeforeState(destination: string, before: PromotionTargetBefore): Promise<void> {
  const exists = await pathExists(destination);
  if (before.kind === "absent") {
    if (exists) {
      throw new ValidationError(`Rollback expected destination to be absent: ${destination}`);
    }
    return;
  }
  if (!exists || await hashSkillDirectory(destination) !== before.hash) {
    throw new ValidationError(`Rollback restoration hash mismatch: ${destination}`);
  }
}

export async function activeHashAt(destination: string): Promise<string | null> {
  if (!await pathExists(destination)) {
    return null;
  }
  return await hashSkillDirectory(destination);
}
