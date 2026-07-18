import type { PromotionOperation } from "../operations/types.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";

export async function failPromotionCheckpoint(root: string, checkpoint: PromotionOperation, error: unknown): Promise<void> {
  await writeOperation(root, {
    ...checkpoint,
    status: "failed",
    recoveryAction: "Inspect recovery evidence before starting a new promotion",
    updatedAt: new Date().toISOString(),
    error: errorMessage(error)
  });
}

export async function recordPromotionFailure(root: string, operationId: string, error: unknown, cleanupWarnings: string[] = []): Promise<void> {
  const primaryError = errorMessage(error);
  await appendEvent(root, {
    operationId,
    kind: "promote",
    phase: "failed",
    evidence: { primaryError, cleanupWarnings },
    error: primaryError
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
