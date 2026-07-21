import { BrainStorageCorruptionError } from "./errors.js";
import { deterministicBrainId } from "./hash.js";
import type {
  BrainActor,
  BrainArtifact,
  BrainArtifactBase,
  BrainArtifactMutationResult,
  BrainLinkMutationResult,
  BrainMutationResult,
  BrainPendingOperation
} from "./types.js";
import { withoutContent } from "./validation.js";

export function createArtifactOperation(
  action: "capture" | "update",
  actor: BrainActor,
  requestId: string,
  payloadHash: string,
  artifact: BrainArtifact,
  createdAt: string,
  base?: BrainArtifactBase
): Extract<BrainPendingOperation, { action: "capture" | "update" }> {
  return {
    version: 1,
    operationId: deterministicBrainId("operation", actor.actorId, requestId),
    action,
    actor,
    requestId,
    payloadHash,
    artifact,
    ...(base ? { base } : {}),
    event: {
      eventId: deterministicBrainId("event", actor.actorId, requestId),
      kind: action === "capture" ? "brain.captured" : "brain.updated",
      actor,
      resource: { kind: "brain-artifact", id: artifact.id, revision: artifact.revision },
      requestId,
      payloadHash,
      createdAt
    },
    createdAt
  };
}

export function pendingOperationResult(operation: BrainPendingOperation, eventSequence: string): BrainMutationResult {
  return operation.action === "link"
    ? { kind: "link", link: operation.link, eventSequence }
    : { kind: "artifact", artifact: withoutContent(operation.artifact), eventSequence };
}

export function requireArtifactResult(result: BrainMutationResult): BrainArtifactMutationResult {
  if (result.kind !== "artifact") {
    throw new BrainStorageCorruptionError("Artifact request replayed a link result");
  }
  return result;
}

export function requireLinkResult(result: BrainMutationResult): BrainLinkMutationResult {
  if (result.kind !== "link") {
    throw new BrainStorageCorruptionError("Link request replayed an artifact result");
  }
  return result;
}
