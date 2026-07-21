import { HubAuthorizationError } from "../auth/index.js";
import {
  BrainError,
  BrainIdempotencyConflictError,
  BrainNotFoundError,
  BrainRevisionConflictError,
  BrainStorageCorruptionError
} from "../brain/index.js";
import type { BrainMcpResult } from "./types.js";

export class BrainMcpError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Readonly<Record<string, string>>) {
    super(message);
  }
}

export function brainMcpErrorResult(error: unknown): BrainMcpResult {
  const mapped = mapBrainMcpError(error);
  const structuredContent = {
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details === undefined ? {} : { details: mapped.details })
    }
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function mapBrainMcpError(error: unknown): BrainMcpError {
  if (error instanceof BrainMcpError) return error;
  if (error instanceof HubAuthorizationError) {
    return new BrainMcpError("HUB_FORBIDDEN", "The authorized principal lacks permission for this operation");
  }
  if (error instanceof BrainNotFoundError) {
    return new BrainMcpError(error.code, error.message, { artifactId: error.artifactId });
  }
  if (error instanceof BrainRevisionConflictError) {
    return new BrainMcpError(error.code, error.message, compactDetails({
      baseRevision: error.baseRevision,
      currentRevision: error.currentRevision,
      baseContentHash: error.baseContentHash,
      currentContentHash: error.currentContentHash
    }));
  }
  if (error instanceof BrainIdempotencyConflictError) {
    return new BrainMcpError(error.code, error.message, { requestId: error.requestId });
  }
  if (error instanceof BrainStorageCorruptionError) {
    return new BrainMcpError(error.code, "Brain storage is inconsistent");
  }
  if (error instanceof BrainError) return new BrainMcpError(error.code, error.message);
  return new BrainMcpError("BRAIN_INTERNAL_ERROR", "Internal server error");
}

function compactDetails(values: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
