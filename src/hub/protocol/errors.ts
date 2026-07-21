export class HubProtocolError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export class HubProtocolValidationError extends HubProtocolError {
  constructor(message: string) {
    super(message, "HUB_PROTOCOL_VALIDATION_ERROR");
  }
}

export class IncompatibleHubProtocolError extends HubProtocolError {
  constructor(clientVersion: string, hubVersion: string) {
    super(`Hub protocol ${hubVersion} is incompatible with client protocol ${clientVersion}`, "HUB_PROTOCOL_INCOMPATIBLE");
  }
}

export class HubClientVersionUnsupportedError extends HubProtocolError {
  constructor(clientVersion: string, minimumVersion: string) {
    super(`Hub requires client ${minimumVersion} or newer; current client is ${clientVersion}`, "HUB_CLIENT_VERSION_UNSUPPORTED");
  }
}
