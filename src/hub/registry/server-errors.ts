export class RegistryServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryServerError";
  }
}

export class RegistryAuthorizationError extends RegistryServerError {
  constructor(message: string) {
    super(message);
    this.name = "RegistryAuthorizationError";
  }
}

export class RegistryIdempotencyConflictError extends RegistryServerError {
  constructor(actorId: string, requestId: string) {
    super(`Request ${requestId} was already used with a different payload by ${actorId}`);
    this.name = "RegistryIdempotencyConflictError";
  }
}

export class RegistryDivergenceError extends RegistryServerError {
  constructor(candidateId: string) {
    super(`Candidate ${candidateId} is divergent and requires explicit rebase or supersession`);
    this.name = "RegistryDivergenceError";
  }
}

export class RegistryPublishBlockedError extends RegistryServerError {
  constructor(candidateId: string) {
    super(`Candidate ${candidateId} has danger findings and cannot be published`);
    this.name = "RegistryPublishBlockedError";
  }
}

export class RegistryNotFoundError extends RegistryServerError {
  constructor(resource: string) {
    super(`Registry resource not found: ${resource}`);
    this.name = "RegistryNotFoundError";
  }
}

export class RegistryStorageCorruptionError extends RegistryServerError {
  constructor(message: string) {
    super(message);
    this.name = "RegistryStorageCorruptionError";
  }
}
