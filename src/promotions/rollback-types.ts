import type { PromotionTargetBefore } from "../domain/types.js";
import type { RollbackOperation } from "../operations/types.js";
import type { MutationSubphase } from "../operations/types.js";

export type RollbackApproval = { yes: boolean; force: boolean };

export type RollbackHooks = {
  beforeCommit?: (destination: string, index: number) => void | Promise<void>;
  afterPreparedCheckpoint?: (checkpoint: RollbackOperation) => void | Promise<void>;
  afterDurableBoundary?: (boundary: string) => void | Promise<void>;
};

export type PreparedRollbackTarget = {
  destination: string;
  stagePath: string | null;
  displacedPath: string;
  afterHash: string;
  before: PromotionTargetBefore;
  activeHash: string | null;
  state: MutationSubphase;
};
