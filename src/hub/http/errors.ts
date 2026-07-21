import { HubAuthorizationError } from "../auth/index.js";
import {
  BrainError,
  BrainIdempotencyConflictError,
  BrainNotFoundError,
  BrainRevisionConflictError,
  BrainStorageCorruptionError
} from "../brain/index.js";
import type { BrainHttpResponse } from "./types.js";

export class BrainHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, string>>
  ) {
    super(message);
  }
}

export function brainHttpErrorResponse(error: unknown): BrainHttpResponse {
  const mapped = mapBrainHttpError(error);
  return {
    status: mapped.status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details === undefined ? {} : { details: mapped.details })
      }
    }
  };
}

function mapBrainHttpError(error: unknown): BrainHttpError {
  if (error instanceof BrainHttpError) return error;
  if (error instanceof HubAuthorizationError) {
    return new BrainHttpError(403, "HUB_FORBIDDEN", "The authorized principal lacks permission for this operation");
  }
  if (error instanceof BrainNotFoundError) {
    return new BrainHttpError(404, error.code, error.message, { artifactId: error.artifactId });
  }
  if (error instanceof BrainRevisionConflictError) {
    return new BrainHttpError(409, error.code, error.message, compactDetails({
      baseRevision: error.baseRevision,
      currentRevision: error.currentRevision,
      baseContentHash: error.baseContentHash,
      currentContentHash: error.currentContentHash
    }));
  }
  if (error instanceof BrainIdempotencyConflictError) {
    return new BrainHttpError(409, error.code, error.message, { requestId: error.requestId });
  }
  if (error instanceof BrainStorageCorruptionError) {
    return new BrainHttpError(500, error.code, "Brain storage is inconsistent");
  }
  if (error instanceof BrainError) {
    return new BrainHttpError(400, error.code, error.message);
  }
  return new BrainHttpError(500, "BRAIN_INTERNAL_ERROR", "Internal server error");
}

function compactDetails(values: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
