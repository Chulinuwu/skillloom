export class HubClientError extends Error {
  constructor(message: string, readonly code: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class HubDiscoveryConfigurationError extends HubClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "HUB_DISCOVERY_CONFIGURATION_ERROR", options);
  }
}

export class HubTrustNotEstablishedError extends HubClientError {
  constructor() {
    super("Hub trust has not been established by explicit setup", "HUB_TRUST_NOT_ESTABLISHED");
  }
}

export class HubTrustChangedError extends HubClientError {
  constructor(field: "hubInstanceId" | "signingKeyFingerprint") {
    super(`Hub ${field} changed; explicit re-trust is required`, "HUB_TRUST_CHANGED");
  }
}

export class HubUnavailableError extends HubClientError {
  constructor(
    message = "Skillloom Hub is unavailable",
    options?: ErrorOptions,
    readonly attempted: readonly string[] = []
  ) {
    super(message, "HUB_UNAVAILABLE", options);
  }
}

export class HubTimeoutError extends HubClientError {
  constructor(message = "Skillloom Hub request timed out", options?: ErrorOptions) {
    super(message, "HUB_TIMEOUT", options);
  }
}

export class HubHttpError extends HubClientError {
  constructor(readonly status: number, message = `Skillloom Hub returned HTTP ${status}`) {
    super(message, "HUB_HTTP_ERROR");
  }
}

export class HubResponseValidationError extends HubClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "HUB_RESPONSE_VALIDATION_ERROR", options);
  }
}

export class HubStableReleaseNotFoundError extends HubClientError {
  constructor(releaseId: string) {
    super(`Stable release was not found: ${releaseId}`, "HUB_STABLE_RELEASE_NOT_FOUND");
  }
}
