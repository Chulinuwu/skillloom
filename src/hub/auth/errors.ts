export class HubAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubAuthorizationError";
  }
}
