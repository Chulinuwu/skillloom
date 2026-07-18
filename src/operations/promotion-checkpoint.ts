import { OperationInterruptedError } from "../domain/errors.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";
import type { PromotionHooks } from "../promotions/types.js";
import type { PromotionOperation } from "./types.js";

export async function persistPromotionCheckpoint(
  root: string,
  checkpoint: PromotionOperation,
  hooks: PromotionHooks
): Promise<void> {
  await writeOperation(root, checkpoint);
  try {
    await hooks.afterCheckpoint?.(checkpoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const interrupted: PromotionOperation = {
      ...checkpoint,
      status: "interrupted",
      recoveryAction: "Run resume with this operation ID after verifying the reported paths",
      updatedAt: new Date().toISOString(),
      error: message
    };
    await writeOperation(root, interrupted);
    await appendEvent(root, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "interrupted",
      evidence: { phase: checkpoint.phase, recoveryAction: interrupted.recoveryAction },
      error: message
    });
    throw new OperationInterruptedError(message);
  }
}
