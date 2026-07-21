import type { EventSequence } from "../protocol/types.js";

export type HubTrustAnchor = {
  version: 1;
  hubInstanceId: string;
  signingKeyFingerprint: string;
  trustedAt: string;
};

export type HubEndpointSource = "development" | "service" | "host";

export type HubEndpointCache = {
  version: 1;
  source: HubEndpointSource;
  serviceName: string;
  url: string;
  verifiedAt: string;
};

export type HubSyncState = {
  version: 1;
  lastEventSequence: EventSequence;
};

export type PendingHubMutation = {
  version: 1;
  requestId: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body: string;
  bodyHash: string;
  createdAt: string;
};

export type PendingHubMutationInput = Omit<PendingHubMutation, "version" | "bodyHash">;

export type HubMutationAcknowledgement<T = unknown> = {
  requestId: string;
  accepted: true;
  data: T;
};
