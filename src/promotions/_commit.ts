import { PromotionTransactionError, ValidationError } from "../domain/errors.js";
import type { PromotionRecord, PromotionTargetRecord } from "../domain/types.js";
import { applyMutation, revertMutation } from "../operations/mutation-service.js";
import type { MutationSubphase, PromotionCheckpointTarget, PromotionOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";
import { writePromotionRecord } from "../store/promotions.js";
import { cleanupPromotionPaths, cleanupResult } from "./_cleanup.js";
import type { PromotionHooks, ResolvedPromotionTarget } from "./types.js";

type AppliedPromotion = Extract<PromotionRecord, { result: "applied" }>;

export type PromotionCommitResult = {
  promotion: PromotionRecord;
  checkpoint: PromotionOperation;
};

export async function commitPromotionTargets(
  root: string,
  initial: PromotionOperation,
  records: PromotionTargetRecord[],
  targets: ResolvedPromotionTarget[],
  hooks: PromotionHooks
): Promise<PromotionCommitResult> {
  let checkpoint = initial;
  if (checkpoint.phase === "compensating") {
    return await compensate(root, checkpoint, records, targets, checkpoint.error ?? "Resumed promotion compensation", hooks);
  }
  try {
    for (const [index, target] of targets.entries()) {
      const storedTarget = requirePreparedTarget(checkpoint.targets[index]);
      if (storedTarget.state === "restored") {
        checkpoint = await updateTarget(root, checkpoint, index, "prepared", hooks);
      }
      if (checkpoint.targets[index].state === "prepared") {
        await hooks.beforeCommit?.(target.request, index);
      }
      await applyMutation({
        target: storedTarget,
        hashes: { beforeHash: beforeHash(storedTarget), afterHash: storedTarget.afterHash },
        state: requirePreparedTarget(checkpoint.targets[index]).state,
        boundaryPrefix: `promotion:${index}`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root, checkpoint, index, state, hooks, boundary);
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root, { operationId: checkpoint.operationId, kind: "promote", phase: "committed", evidence: records[index] });
    }
  } catch (error) {
    return await compensate(root, checkpoint, records, targets, error, hooks);
  }
  const pending: AppliedPromotion = {
    promotionId: checkpoint.promotionId,
    operationId: checkpoint.operationId,
    candidateId: checkpoint.candidateId,
    createdAt: new Date().toISOString(),
    targets: records,
    result: "applied",
    cleanup: { status: "pending" }
  };
  await writePromotionRecord(root, pending);
  const warnings = await cleanupPromotionPaths("applied", checkpoint.targets.map((target) => target.displacedPath), hooks);
  const promotion: AppliedPromotion = { ...pending, cleanup: cleanupResult(warnings) };
  try {
    await writePromotionRecord(root, promotion);
  } catch (error) {
    await appendCleanupWarning(root, checkpoint.operationId, {
      promotionId: checkpoint.promotionId,
      cleanup: promotion.cleanup,
      recordError: errorMessage(error)
    });
    checkpoint = await completeOperation(root, checkpoint, "applied");
    return { promotion: pending, checkpoint };
  }
  checkpoint = await completeOperation(root, checkpoint, "applied");
  try {
    await appendEvent(root, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "completed",
      evidence: { promotionId: checkpoint.promotionId, result: "applied", cleanup: promotion.cleanup }
    });
  } catch {
  }
  return { promotion, checkpoint };
}

async function compensate(
  root: string,
  initial: PromotionOperation,
  records: PromotionTargetRecord[],
  targets: ResolvedPromotionTarget[],
  cause: unknown,
  hooks: PromotionHooks
): Promise<PromotionCommitResult> {
  let checkpoint: PromotionOperation = {
    ...initial,
    phase: "compensating",
    recoveryAction: `skillloom resume ${initial.operationId} --yes`,
    updatedAt: new Date().toISOString()
  };
  await writeOperation(root, checkpoint);
  try {
    await appendEvent(root, { operationId: checkpoint.operationId, kind: "promote", phase: "compensating", error: errorMessage(cause) });
  } catch {
  }
  try {
    for (let index = checkpoint.targets.length - 1; index >= 0; index -= 1) {
      const storedTarget = requirePreparedTarget(checkpoint.targets[index]);
      await revertMutation({
        target: storedTarget,
        hashes: { beforeHash: beforeHash(storedTarget), afterHash: storedTarget.afterHash },
        state: storedTarget.state,
        boundaryPrefix: `promotion:${index}:compensation`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root, checkpoint, index, state, hooks, boundary, "compensating");
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root, {
        operationId: checkpoint.operationId,
        kind: "promote",
        phase: "compensated",
        evidence: { target: targets[index].request.adapter.name, destination: targets[index].destination }
      });
    }
  } catch (error) {
    await appendFailure(root, checkpoint.operationId, error);
    throw new PromotionTransactionError(`Promotion failed and compensation failed: ${errorMessage(error)}`);
  }
  const warnings = await cleanupPromotionPaths("compensated", checkpoint.targets.map((target) => target.stagePath), hooks);
  const promotion: PromotionRecord = {
    promotionId: checkpoint.promotionId,
    operationId: checkpoint.operationId,
    candidateId: checkpoint.candidateId,
    createdAt: new Date().toISOString(),
    targets: records,
    result: "compensated",
    error: errorMessage(cause),
    cleanup: cleanupResult(warnings)
  };
  await writePromotionRecord(root, promotion);
  checkpoint = await completeOperation(root, checkpoint, "compensated", errorMessage(cause));
  try {
    await appendEvent(root, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "completed",
      evidence: { promotionId: checkpoint.promotionId, result: "compensated", cleanup: promotion.cleanup }
    });
  } catch {
  }
  return { promotion, checkpoint };
}

async function updateTarget(
  root: string,
  checkpoint: PromotionOperation,
  index: number,
  state: MutationSubphase,
  hooks: PromotionHooks,
  boundary?: string,
  phase: PromotionOperation["phase"] = "committing"
): Promise<PromotionOperation> {
  const targets = checkpoint.targets.map((target, targetIndex) => targetIndex === index ? transitionTarget(target, state) : target);
  const updated: PromotionOperation = {
    ...checkpoint,
    phase,
    status: "in-progress",
    recoveryAction: `skillloom resume ${checkpoint.operationId} --yes`,
    updatedAt: new Date().toISOString(),
    targets
  };
  await writeOperation(root, updated);
  if (boundary) {
    await hooks.afterDurableBoundary?.(boundary);
  }
  return updated;
}

function transitionTarget(target: PromotionCheckpointTarget, state: MutationSubphase): PromotionCheckpointTarget {
  if (!target.before) {
    throw new ValidationError(`Promotion before-state is missing: ${target.destination}`);
  }
  return { ...target, before: target.before, state };
}

function requirePreparedTarget(target: PromotionCheckpointTarget): Extract<PromotionCheckpointTarget, { state: MutationSubphase }> {
  if (!target.before) {
    throw new ValidationError(`Promotion target is not prepared: ${target.destination}`);
  }
  return target;
}

function beforeHash(target: Extract<PromotionCheckpointTarget, { state: MutationSubphase }>): string | null {
  return target.before.kind === "present" ? target.before.hash : null;
}

async function completeOperation(
  root: string,
  checkpoint: PromotionOperation,
  phase: "applied" | "compensated",
  error?: string
): Promise<PromotionOperation> {
  const completed: PromotionOperation = {
    ...checkpoint,
    phase,
    status: "completed",
    recoveryAction: "None",
    updatedAt: new Date().toISOString(),
    error
  };
  await writeOperation(root, completed);
  return completed;
}

async function appendFailure(root: string, operationId: string, error: unknown): Promise<void> {
  try {
    await appendEvent(root, { operationId, kind: "promote", phase: "failed", error: errorMessage(error) });
  } catch {
  }
}

async function appendCleanupWarning(root: string, operationId: string, evidence: unknown): Promise<void> {
  try {
    await appendEvent(root, { operationId, kind: "promote", phase: "cleanup-warning", evidence });
  } catch {
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
