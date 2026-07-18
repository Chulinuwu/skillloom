import { randomUUID } from "node:crypto";
import { canonicalizeFuturePath } from "../adapters/physical-path.js";
import { ensureConfig } from "../config/service.js";
import { OperationInterruptedError, PromotionPolicyError } from "../domain/errors.js";
import type { CandidateBase, PromotionRecord, PromotionTargetRecord } from "../domain/types.js";
import { withStoreLock } from "../files/lock.js";
import { persistPromotionCheckpoint } from "../operations/promotion-checkpoint.js";
import type { PromotionOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { storeLayout } from "../store/layout.js";
import { writeOperation } from "../store/operations.js";
import { commitPromotionTargets } from "./_commit.js";
import { assertPromotionFindings, verifyPromotionCandidate } from "./_policy.js";
import { backupPromotionTargets, cleanupPreparation, stagePromotionTargets } from "./_prepare.js";
import { assertSafeDestinations, resolvePromotionTargets } from "./_targets.js";
import { assertBaseState } from "./_base-policy.js";
import { errorMessage, failPromotionCheckpoint, recordPromotionFailure } from "./_promotion-failure.js";
import type { PromotionApproval, PromotionContext, PromotionHooks, PromotionTarget } from "./types.js";
import { evaluateAutoPromotion } from "../policy/evaluate.js";

export async function promoteCandidate(
  context: PromotionContext,
  candidateId: string,
  targets: PromotionTarget[],
  approval: PromotionApproval,
  hooks: PromotionHooks = {}
): Promise<PromotionRecord> {
  const policyApproval = approval.kind === "policy";
  if (!policyApproval && !approval.yes) {
    throw new PromotionPolicyError("Promotion requires explicit approval with --yes");
  }
  if (targets.length === 0) {
    throw new PromotionPolicyError("Promotion requires at least one target");
  }
  const config = await ensureConfig(context.projectRoot);
  const { canonical, validation, candidate } = await verifyPromotionCandidate(context.projectRoot, candidateId);
  if (policyApproval) {
    const decision = evaluateAutoPromotion(config, {
      candidateId,
      packageHash: validation.packageHash,
      targets: targets.map((target) => target.adapter.name),
      scopes: targets.map((target) => "scope" in target ? target.scope : "explicit"),
      files: validation.files,
      warnings: validation.findings.filter((finding) => finding.severity === "warning").length,
      dangers: validation.findings.filter((finding) => finding.severity === "danger").length
    });
    await appendEvent(context.projectRoot, {
      operationId: `op-policy-${randomUUID()}`,
      kind: "policy",
      phase: decision.approved ? "completed" : "failed",
      evidence: decision,
      ...(decision.approved ? {} : { error: decision.reasons.join("; ") })
    });
    if (!decision.approved) {
      throw new PromotionPolicyError(`Automatic promotion quarantined: ${decision.reasons.join("; ")}`);
    }
  } else {
    assertPromotionFindings(validation.findings, approval.acceptWarnings);
  }
  const operationId = `op-promote-${randomUUID()}`;
  const promotionId = `promo-${randomUUID()}`;
  const resolvedTargets = await resolvePromotionTargets(context, validation.metadata.name, targets, promotionId);
  const canonicalStoreRoot = await canonicalizeFuturePath(storeLayout(context.projectRoot).root);
  assertSafeDestinations(canonicalStoreRoot, resolvedTargets);
  return await withStoreLock(context.projectRoot, async () => {
    const base = candidate.base ?? { kind: "none" } satisfies CandidateBase;
    await assertBaseState(base, resolvedTargets.map((target) => target.destination));
    const now = new Date().toISOString();
    let checkpoint: PromotionOperation = {
      kind: "promote",
      operationId,
      promotionId,
      candidateId,
      candidateHash: validation.packageHash,
      createdAt: now,
      updatedAt: now,
      status: "in-progress",
      phase: "intent",
      recoveryAction: "Preparation has not reached a resumable checkpoint",
      targets: resolvedTargets.map((target) => ({
        target: target.request.adapter.name,
        scope: target.scope,
        destination: target.destination,
        stagePath: target.stagePath,
        displacedPath: target.displacedPath,
        afterHash: validation.packageHash,
        before: null,
        state: "intent"
      }))
    };
    await appendEvent(context.projectRoot, { operationId, kind: "promote", phase: "started", evidence: { promotionId, candidateId } });
    await appendEvent(context.projectRoot, {
      operationId,
      kind: "promote",
      phase: "candidate-verified",
      evidence: { candidateId, packageHash: validation.packageHash }
    });
    await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
    let records: PromotionTargetRecord[];
    try {
      checkpoint = { ...checkpoint, phase: "staging", updatedAt: new Date().toISOString() };
      await writeOperation(context.projectRoot, checkpoint);
      await stagePromotionTargets(context.projectRoot, operationId, canonical, validation.packageHash, resolvedTargets, hooks);
      checkpoint = {
        ...checkpoint,
        phase: "staged",
        updatedAt: new Date().toISOString(),
        targets: checkpoint.targets.map((target) => ({ ...target, state: "staged", before: null }))
      };
      await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
      checkpoint = { ...checkpoint, phase: "backing-up", updatedAt: new Date().toISOString() };
      await writeOperation(context.projectRoot, checkpoint);
      records = await backupPromotionTargets(
        context.projectRoot,
        operationId,
        promotionId,
        validation.packageHash,
        resolvedTargets,
        hooks,
        base.kind === "installed" ? base.hash : undefined
      );
      checkpoint = {
        ...checkpoint,
        phase: "prepared",
        updatedAt: new Date().toISOString(),
        recoveryAction: `skillloom resume ${operationId} --yes`,
        targets: checkpoint.targets.map((target, index) => ({ ...target, state: "prepared", before: records[index].before }))
      };
      await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
    } catch (error) {
      if (error instanceof OperationInterruptedError) {
        throw error;
      }
      let cleanupWarnings: string[] = [];
      try {
        cleanupWarnings = await cleanupPreparation(context.projectRoot, promotionId, resolvedTargets, hooks);
      } catch (cleanupError) {
        cleanupWarnings = [`preparation cleanup failed: ${errorMessage(cleanupError)}`];
      }
      await failPromotionCheckpoint(context.projectRoot, checkpoint, error);
      try {
        await recordPromotionFailure(context.projectRoot, operationId, error, cleanupWarnings);
      } catch {
      }
      throw error;
    }
    const result = await commitPromotionTargets(context.projectRoot, checkpoint, records, resolvedTargets, hooks);
    return result.promotion;
  }, { operationId, context: "promote" });
}
