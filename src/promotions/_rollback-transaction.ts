import { PromotionTransactionError, ValidationError } from "../domain/errors.js";
import type { PromotionRecord } from "../domain/types.js";
import { applyMutation, revertMutation } from "../operations/mutation-service.js";
import type { MutationSubphase, RollbackCheckpointTarget, RollbackOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";
import { writePromotionRecord } from "../store/promotions.js";
import { cleanupRollbackPaths, rollbackCleanupResult } from "./_rollback-cleanup.js";
import type { RollbackHooks } from "./rollback-types.js";

export type RollbackTransactionResult = {
  promotion: Extract<PromotionRecord, { result: "rolled-back" }>;
  checkpoint: RollbackOperation;
};

export async function commitRollbackTargets(
  root: string,
  promotion: Extract<PromotionRecord, { result: "applied" }>,
  initial: RollbackOperation,
  hooks: RollbackHooks
): Promise<RollbackTransactionResult> {
  let checkpoint = initial;
  if (checkpoint.phase === "compensating") {
    await compensateRollback(root, checkpoint, hooks, checkpoint.error ?? "Resumed rollback compensation");
    throw new PromotionTransactionError(`Rollback failed and was compensated: ${checkpoint.error ?? "resumed failure"}`);
  }
  try {
    for (const [index, target] of checkpoint.targets.entries()) {
      if (target.state === "restored") {
        checkpoint = await updateTarget(root, checkpoint, index, "prepared", hooks);
      }
      if (checkpoint.targets[index].state === "prepared") {
        await hooks.beforeCommit?.(target.destination, index);
      }
      await applyMutation({
        target,
        hashes: mutationHashes(target),
        state: checkpoint.targets[index].state,
        boundaryPrefix: `rollback:${index}`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root, checkpoint, index, state, hooks, boundary);
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root, {
        operationId: checkpoint.operationId,
        kind: "rollback",
        phase: "committed",
        evidence: { destination: target.destination, before: target.before }
      });
    }
  } catch (error) {
    await compensateRollback(root, checkpoint, hooks, error);
    throw new PromotionTransactionError(`Rollback failed and was compensated: ${errorMessage(error)}`);
  }
  const pending: Extract<PromotionRecord, { result: "rolled-back" }> = {
    ...promotion,
    result: "rolled-back",
    rollbackOperationId: checkpoint.operationId,
    rolledBackAt: new Date().toISOString(),
    forced: checkpoint.force,
    cleanup: { status: "pending" }
  };
  await writePromotionRecord(root, pending);
  const warnings = await cleanupRollbackPaths(checkpoint.targets.map((target) => target.displacedPath));
  const result: Extract<PromotionRecord, { result: "rolled-back" }> = { ...pending, cleanup: rollbackCleanupResult(warnings) };
  await writePromotionRecord(root, result);
  checkpoint = await completeRollback(root, checkpoint, "rolled-back");
  await appendEvent(root, {
    operationId: checkpoint.operationId,
    kind: "rollback",
    phase: "completed",
    evidence: { promotionId: checkpoint.promotionId, cleanup: result.cleanup }
  });
  return { promotion: result, checkpoint };
}

async function compensateRollback(
  root: string,
  initial: RollbackOperation,
  hooks: RollbackHooks,
  cause: unknown
): Promise<RollbackOperation> {
  let checkpoint: RollbackOperation = {
    ...initial,
    phase: "compensating",
    recoveryAction: `skillloom resume ${initial.operationId} --yes`,
    updatedAt: new Date().toISOString(),
    error: errorMessage(cause)
  };
  await writeOperation(root, checkpoint);
  try {
    for (let index = checkpoint.targets.length - 1; index >= 0; index -= 1) {
      const target = checkpoint.targets[index];
      await revertMutation({
        target,
        hashes: mutationHashes(target),
        state: target.state,
        boundaryPrefix: `rollback:${index}:compensation`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root, checkpoint, index, state, hooks, boundary, "compensating");
        },
        afterBoundary: hooks.afterDurableBoundary
      });
    }
  } catch (error) {
    await appendEvent(root, { operationId: checkpoint.operationId, kind: "rollback", phase: "failed", error: errorMessage(error) });
    throw new PromotionTransactionError(`Rollback failed and compensation failed: ${errorMessage(error)}`);
  }
  await cleanupRollbackPaths(checkpoint.targets.flatMap((target) => target.stagePath ? [target.stagePath] : []));
  checkpoint = await completeRollback(root, checkpoint, "compensated", errorMessage(cause));
  await appendEvent(root, { operationId: checkpoint.operationId, kind: "rollback", phase: "compensated", error: errorMessage(cause) });
  return checkpoint;
}

async function updateTarget(
  root: string,
  checkpoint: RollbackOperation,
  index: number,
  state: MutationSubphase,
  hooks: RollbackHooks,
  boundary?: string,
  phase: RollbackOperation["phase"] = "committing"
): Promise<RollbackOperation> {
  const target = checkpoint.targets[index];
  if (!target) {
    throw new ValidationError(`Rollback target ${index} is missing`);
  }
  const updated: RollbackOperation = {
    ...checkpoint,
    phase,
    status: "in-progress",
    recoveryAction: `skillloom resume ${checkpoint.operationId} --yes`,
    updatedAt: new Date().toISOString(),
    targets: checkpoint.targets.map((item, targetIndex) => targetIndex === index ? { ...item, state } : item)
  };
  await writeOperation(root, updated);
  if (boundary) {
    await hooks.afterDurableBoundary?.(boundary);
  }
  return updated;
}

function mutationHashes(target: RollbackCheckpointTarget) {
  return {
    beforeHash: target.activeHash,
    afterHash: target.before.kind === "present" ? target.before.hash : null
  };
}

async function completeRollback(
  root: string,
  checkpoint: RollbackOperation,
  phase: "rolled-back" | "compensated",
  error?: string
): Promise<RollbackOperation> {
  const completed: RollbackOperation = {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
