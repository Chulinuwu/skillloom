import { inspectMutationPaths, matchingMutationLayouts } from "./mutation-layout.js";
import type { OperationRecord, PromotionCheckpointTarget, RollbackCheckpointTarget } from "./types.js";

export type OperationRecoveryDiagnostic = {
  operationId: string;
  kind: "promote" | "rollback";
  status: string;
  phase: string;
  recoveryCommand: string | null;
  targets: Array<{
    destination: string;
    recordedState: string;
    observedLayouts: string[];
    destinationHash: string | null;
    stageHash: string | null;
    displacedHash: string | null;
    valid: boolean;
  }>;
};

export async function inspectOperationRecovery(operation: OperationRecord): Promise<OperationRecoveryDiagnostic | null> {
  if (operation.kind === "capture" || operation.status === "completed" || operation.status === "failed") {
    return null;
  }
  const targets = operation.kind === "promote"
    ? await Promise.all(operation.targets.map(inspectPromotionTarget))
    : await Promise.all(operation.targets.map(inspectRollbackTarget));
  const phaseResumable = operation.phase === "prepared" || operation.phase === "committing" || operation.phase === "compensating";
  return {
    operationId: operation.operationId,
    kind: operation.kind,
    status: operation.status,
    phase: operation.phase,
    recoveryCommand: phaseResumable && targets.every((target) => target.valid)
      ? `skillloom resume ${operation.operationId} --yes`
      : null,
    targets
  };
}

async function inspectPromotionTarget(target: PromotionCheckpointTarget) {
  const observed = await inspectMutationPaths(target);
  const hashes = promotionHashes(target);
  const observedLayouts = hashes ? matchingMutationLayouts(observed, hashes) : [];
  return {
    destination: target.destination,
    recordedState: target.state,
    observedLayouts,
    ...observed,
    valid: hashes !== null && observedLayouts.length > 0
  };
}

async function inspectRollbackTarget(target: RollbackCheckpointTarget) {
  const observed = await inspectMutationPaths(target);
  const observedLayouts = matchingMutationLayouts(observed, rollbackHashes(target));
  return {
    destination: target.destination,
    recordedState: target.state,
    observedLayouts,
    ...observed,
    valid: observedLayouts.length > 0
  };
}

function promotionHashes(target: PromotionCheckpointTarget) {
  if (!target.before) {
    return null;
  }
  return {
    beforeHash: target.before.kind === "present" ? target.before.hash : null,
    afterHash: target.afterHash
  };
}

function rollbackHashes(target: RollbackCheckpointTarget) {
  return {
    beforeHash: target.activeHash,
    afterHash: target.before.kind === "present" ? target.before.hash : null
  };
}
