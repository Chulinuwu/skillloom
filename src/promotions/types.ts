import type { AdapterContext, Scope, TargetScope } from "../domain/types.js";
import type { GenericDirectoryAdapter, ScopedHarnessAdapter } from "../adapters/types.js";
import type { PromotionOperation } from "../operations/types.js";

export type PromotionApproval =
  | { kind?: "explicit"; yes: boolean; acceptWarnings: boolean }
  | { kind: "policy" };

export type PromotionContext = AdapterContext;

export type ScopedPromotionTarget = {
  adapter: ScopedHarnessAdapter;
  scope: Scope;
};

export type GenericPromotionTarget = {
  adapter: GenericDirectoryAdapter;
  destinationRoot: string;
};

export type PromotionTarget = ScopedPromotionTarget | GenericPromotionTarget;

export type PromotionHooks = {
  beforeStage?: (target: PromotionTarget, index: number) => void | Promise<void>;
  beforeBackup?: (target: PromotionTarget, index: number) => void | Promise<void>;
  beforeCommit?: (target: PromotionTarget, index: number) => void | Promise<void>;
  beforeCleanup?: (phase: "preparation" | "applied" | "compensated", path: string, index: number) => void | Promise<void>;
  afterCheckpoint?: (checkpoint: PromotionOperation) => void | Promise<void>;
  afterDurableBoundary?: (boundary: string) => void | Promise<void>;
};

export type ResolvedPromotionTarget = {
  request: PromotionTarget;
  scope: TargetScope;
  destination: string;
  stagePath: string;
  displacedPath: string;
};
