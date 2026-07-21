export type EventSequence = string;

export type HubActorKind = "user" | "node";

export type TailnetIdentity = {
  actorId: string;
  kind: HubActorKind;
  displayName?: string;
  nodeId?: string;
  nodeName?: string;
};

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type NormalizedApplicationCapability = {
  name: string;
  grants: Array<{ [key: string]: JsonValue }>;
};

export type NormalizedTrustedIdentity = TailnetIdentity & {
  appCapabilities: NormalizedApplicationCapability[];
};

export type TrustedIdentityInput = {
  userLogin?: unknown;
  userDisplayName?: unknown;
  nodeId?: unknown;
  nodeName?: unknown;
  appCapabilities?: unknown;
};

export type NegotiationRequest = {
  protocolVersion: string;
  clientVersion: string;
};

export type NegotiationResponse = {
  protocolVersion: string;
  minimumClientVersion: string;
  hubInstanceId: string;
  tailnetIdentity: TailnetIdentity;
  grantedCapabilities: string[];
  releaseSigningPublicKey: string;
  latestEventSequence: EventSequence;
};

export type NegotiationCompatibility = {
  protocolVersion: string;
  clientVersion: string;
};
