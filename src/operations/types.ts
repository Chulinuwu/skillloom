import type { PromotionTargetBefore, TargetName, TargetScope } from "../domain/types.js";

export type OperationStatus = "in-progress" | "interrupted" | "completed" | "failed";

export type PromotionCheckpointPhase =
  | "intent"
  | "staging"
  | "staged"
  | "backing-up"
  | "prepared"
  | "committing"
  | "applied"
  | "compensating"
  | "compensated";

export type MutationSubphase =
  | "prepared"
  | "displace-intent"
  | "displaced"
  | "install-intent"
  | "installed"
  | "undo-install-intent"
  | "uninstalled"
  | "undo-displace-intent"
  | "restored";

type PromotionTargetCommon = {
  target: TargetName;
  scope: TargetScope;
  destination: string;
  stagePath: string;
  displacedPath: string;
  afterHash: string;
};

export type PromotionCheckpointTarget =
  | (PromotionTargetCommon & { state: "intent" | "staged"; before: null })
  | (PromotionTargetCommon & { state: MutationSubphase; before: PromotionTargetBefore });

export type PromotionOperation = {
  kind: "promote";
  operationId: string;
  promotionId: string;
  candidateId: string;
  candidateHash: string;
  createdAt: string;
  updatedAt: string;
  status: OperationStatus;
  phase: PromotionCheckpointPhase;
  recoveryAction: string;
  targets: PromotionCheckpointTarget[];
  error?: string;
};

export type CaptureOperation = {
  kind: "capture";
  operationId: string;
  createdAt: string;
  updatedAt: string;
  status: OperationStatus;
  phase: "started" | "validated" | "snapshotted" | "completed";
  recoveryAction: string;
  candidateId?: string;
  error?: string;
};

export type RollbackCheckpointPhase = "intent" | "prepared" | "committing" | "rolled-back" | "compensating" | "compensated";

export type RollbackCheckpointTarget = {
  destination: string;
  stagePath: string | null;
  displacedPath: string;
  afterHash: string;
  before: PromotionTargetBefore;
  activeHash: string | null;
  state: MutationSubphase;
};

export type RollbackOperation = {
  kind: "rollback";
  operationId: string;
  promotionId: string;
  createdAt: string;
  updatedAt: string;
  status: OperationStatus;
  phase: RollbackCheckpointPhase;
  recoveryAction: string;
  force: boolean;
  targets: RollbackCheckpointTarget[];
  error?: string;
};

export type OperationRecord = PromotionOperation | CaptureOperation | RollbackOperation;

export type LockDiagnostic =
  | { state: "unlocked" }
  | {
      state: "active" | "stale" | "invalid";
      path: string;
      action: string;
      pid?: number;
      createdAt?: string;
      operationId?: string;
      context?: string;
    };
