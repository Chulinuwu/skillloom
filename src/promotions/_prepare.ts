import { basename, join } from "node:path";
import { ValidationError } from "../domain/errors.js";
import type { PromotionTargetBefore, PromotionTargetRecord } from "../domain/types.js";
import { appendEvent } from "../store/journal.js";
import { storeLayout } from "../store/layout.js";
import { backupSkill, hashSkillDirectory, pathExists, stageCanonicalSkill } from "./files.js";
import { cleanupPromotionPaths } from "./_cleanup.js";
import type { PromotionHooks, ResolvedPromotionTarget } from "./types.js";

export async function stagePromotionTargets(
  root: string,
  operationId: string,
  canonical: string,
  expectedHash: string,
  targets: ResolvedPromotionTarget[],
  hooks: PromotionHooks
): Promise<void> {
  for (const [index, target] of targets.entries()) {
    await hooks.beforeStage?.(target.request, index);
    const stagedHash = await stageCanonicalSkill(canonical, target.stagePath, expectedHash);
    if (stagedHash !== expectedHash) {
      throw new ValidationError(`Staged package hash mismatch for ${target.request.adapter.name}`);
    }
    await appendEvent(root, {
      operationId,
      kind: "promote",
      phase: "staged",
      evidence: { target: target.request.adapter.name, scope: target.scope, destination: target.destination, stagePath: target.stagePath, packageHash: stagedHash }
    });
  }
}

export async function backupPromotionTargets(
  root: string,
  operationId: string,
  promotionId: string,
  afterHash: string,
  targets: ResolvedPromotionTarget[],
  hooks: PromotionHooks,
  expectedBaseHash?: string
): Promise<PromotionTargetRecord[]> {
  const records: PromotionTargetRecord[] = [];
  for (const [index, target] of targets.entries()) {
    await hooks.beforeBackup?.(target.request, index);
    const before = await backupTarget(root, promotionId, index, target, expectedBaseHash);
    const record = {
      target: target.request.adapter.name,
      scope: target.scope,
      destination: target.destination,
      before,
      afterHash
    };
    records.push(record);
    await appendEvent(root, { operationId, kind: "promote", phase: "backed-up", evidence: record });
  }
  return records;
}

export async function cleanupPreparation(
  root: string,
  promotionId: string,
  targets: ResolvedPromotionTarget[],
  hooks: PromotionHooks
): Promise<string[]> {
  return await cleanupPromotionPaths("preparation", [
    ...targets.flatMap((target) => [target.stagePath, target.displacedPath]),
    join(storeLayout(root).backups, promotionId)
  ], hooks);
}

async function backupTarget(
  root: string,
  promotionId: string,
  index: number,
  target: ResolvedPromotionTarget,
  expectedBaseHash?: string
): Promise<PromotionTargetBefore> {
  if (!await pathExists(target.destination)) {
    return { kind: "absent" };
  }
  const hash = await hashSkillDirectory(target.destination, expectedBaseHash);
  if (expectedBaseHash && hash !== expectedBaseHash) {
    throw new ValidationError(`Installed base hash mismatch for ${target.request.adapter.name}`);
  }
  const backupPath = join(storeLayout(root).backups, promotionId, `${index}-${target.request.adapter.name}-${target.scope}`, basename(target.destination));
  const backupHash = await backupSkill(target.destination, backupPath, hash);
  if (backupHash !== hash) {
    throw new ValidationError(`Backup hash mismatch for ${target.request.adapter.name}`);
  }
  return { kind: "present", hash, backupPath };
}
