export class HubStateValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class HubPendingAcknowledgementError extends Error {
  constructor(message: string) {
    super(message);
  }
}
