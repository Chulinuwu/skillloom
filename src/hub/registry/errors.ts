export class RegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryValidationError";
  }
}

export class RegistryCanonicalJsonError extends RegistryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "RegistryCanonicalJsonError";
  }
}

export class RegistryPackageError extends RegistryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "RegistryPackageError";
  }
}

export class RegistrySignatureVerificationError extends RegistryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "RegistrySignatureVerificationError";
  }
}

export class RegistryHubMismatchError extends RegistrySignatureVerificationError {
  constructor(expected: string, received: string) {
    super(`Hub instance mismatch: expected ${expected}, received ${received}`);
    this.name = "RegistryHubMismatchError";
  }
}

export class RegistrySequenceRollbackError extends RegistrySignatureVerificationError {
  constructor(afterSequence: string, received: string) {
    super(`Registry sequence rollback: expected a sequence after ${afterSequence}, received ${received}`);
    this.name = "RegistrySequenceRollbackError";
  }
}
