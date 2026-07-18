export class SkillloomError extends Error {
  constructor(
    message: string,
    readonly code = "SKILLLOOM_ERROR",
    readonly exitCode = 1
  ) {
    super(message);
  }
}

export class UsageError extends SkillloomError {
  constructor(message: string) {
    super(message, "USAGE_ERROR", 2);
  }
}

export class PathPolicyError extends SkillloomError {
  constructor(message: string) {
    super(message, "PATH_POLICY_ERROR", 3);
  }
}

export class ValidationError extends SkillloomError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 4);
  }
}

export class LockError extends SkillloomError {
  constructor(message: string) {
    super(message, "LOCK_ERROR", 5);
  }
}
export class PromotionPolicyError extends SkillloomError {
  constructor(message: string) {
    super(message, "PROMOTION_POLICY_ERROR", 6);
  }
}
export class PromotionTransactionError extends SkillloomError {
  constructor(message: string) {
    super(message, "PROMOTION_TRANSACTION_ERROR", 7);
  }
}
export class OperationInterruptedError extends SkillloomError {
  constructor(message: string) {
    super(message, "OPERATION_INTERRUPTED", 8);
  }
}
export class JournalCorruptionError extends SkillloomError {
  constructor(
    message: string,
    readonly corruption: "malformed" | "truncated" | "sequence",
    readonly validEvents: number
  ) {
    super(message, "JOURNAL_CORRUPTION", 9);
  }
}
