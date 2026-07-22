export class BrainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export class BrainValidationError extends BrainError {
  constructor(message: string) {
    super(message, "BRAIN_VALIDATION_ERROR");
  }
}

export class BrainNotFoundError extends BrainError {
  constructor(readonly artifactId: string) {
    super(`Brain artifact ${artifactId} was not found`, "BRAIN_ARTIFACT_NOT_FOUND");
  }
}

export class BrainRevisionConflictError extends BrainError {
  constructor(
    readonly baseRevision: string,
    readonly currentRevision: string,
    readonly baseContentHash?: string,
    readonly currentContentHash?: string
  ) {
    super(`Brain revision conflict: base ${baseRevision}, current ${currentRevision}`, "BRAIN_REVISION_CONFLICT");
  }
}

export class BrainIdempotencyConflictError extends BrainError {
  constructor(readonly actorId: string, readonly requestId: string) {
    super(`Request ${requestId} was already used by ${actorId} with a different payload`, "BRAIN_IDEMPOTENCY_CONFLICT");
  }
}

export class BrainImmutableSourceError extends BrainError {
  constructor(readonly artifactId: string) {
    super(`Brain source artifact ${artifactId} is immutable`, "BRAIN_IMMUTABLE_SOURCE");
  }
}
export class BrainSourceSensitivityMismatchError extends BrainError {
  constructor(readonly contentHash: string) {
    super(`Brain source ${contentHash} already exists with a different sensitivity`, "BRAIN_SOURCE_SENSITIVITY_MISMATCH");
  }
}
export class BrainStorageCorruptionError extends BrainError {
  constructor(message: string) {
    super(message, "BRAIN_STORAGE_CORRUPTION");
  }
}
