import { createHash } from "node:crypto";
import { isCanonicalEventSequence } from "../protocol/version.js";
import { DEFAULT_HUB_SERVICE_NAME, HUB_CLIENT_STATE_VERSION } from "./constants.js";
import { HubStateValidationError } from "./errors.js";
import type { HubEndpointCache, HubMutationAcknowledgement, HubSyncState, HubTrustAnchor, PendingHubMutation } from "./types.js";

export function createDefaultHubSyncState(): HubSyncState {
  return { version: HUB_CLIENT_STATE_VERSION, lastEventSequence: "0" };
}

export function parseHubTrust(value: unknown): HubTrustAnchor {
  const record = exactRecord(value, ["version", "hubInstanceId", "signingKeyFingerprint", "trustedAt"], "Hub trust");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isNonemptyString(record.hubInstanceId)
    || typeof record.signingKeyFingerprint !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/.test(record.signingKeyFingerprint)
    || !isTimestamp(record.trustedAt)) {
    throw new HubStateValidationError("Invalid Hub trust state");
  }
  return {
    version: 1,
    hubInstanceId: record.hubInstanceId,
    signingKeyFingerprint: record.signingKeyFingerprint,
    trustedAt: record.trustedAt
  };
}

export function parseHubEndpoint(value: unknown): HubEndpointCache {
  const record = exactRecord(value, ["version", "source", "serviceName", "url", "verifiedAt"], "Hub endpoint");
  if (record.version !== HUB_CLIENT_STATE_VERSION
    || record.source !== "development" && record.source !== "service" && record.source !== "host"
    || record.serviceName !== DEFAULT_HUB_SERVICE_NAME || !isTimestamp(record.verifiedAt)) {
    throw new HubStateValidationError("Invalid Hub endpoint cache");
  }
  const url = validateHubUrl(record.url, record.source === "development");
  return { version: 1, source: record.source, serviceName: record.serviceName, url, verifiedAt: record.verifiedAt };
}

export function parseHubSyncState(value: unknown): HubSyncState {
  const record = exactRecord(value, ["version", "lastEventSequence"], "Hub sync");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isCanonicalEventSequence(record.lastEventSequence)) {
    throw new HubStateValidationError("Invalid Hub sync state");
  }
  return { version: 1, lastEventSequence: record.lastEventSequence };
}

export function parsePendingHubMutation(value: unknown): PendingHubMutation {
  const record = exactRecord(value, ["version", "requestId", "method", "path", "body", "bodyHash", "createdAt"], "Pending Hub mutation");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isUuid(record.requestId)
    || record.method !== "POST" && record.method !== "PUT" && record.method !== "PATCH" && record.method !== "DELETE"
    || !isSafePath(record.path) || typeof record.body !== "string"
    || typeof record.bodyHash !== "string" || record.bodyHash !== bodyDigest(record.body)
    || !isTimestamp(record.createdAt)) {
    throw new HubStateValidationError("Invalid pending Hub mutation");
  }
  return {
    version: 1,
    requestId: record.requestId,
    method: record.method,
    path: record.path,
    body: record.body,
    bodyHash: record.bodyHash,
    createdAt: record.createdAt
  };
}

export function parseHubMutationAcknowledgement(value: unknown): HubMutationAcknowledgement {
  if (!isRecord(value) || !isUuid(value.requestId) || value.accepted !== true || !Object.hasOwn(value, "data")) {
    throw new HubStateValidationError("Invalid Hub mutation acknowledgement");
  }
  return { requestId: value.requestId, accepted: true, data: value.data };
}

export function validateHubUrl(value: unknown, allowLoopbackHttp: boolean): string {
  if (typeof value !== "string") throw new HubStateValidationError("Hub URL must be a string");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HubStateValidationError("Hub URL is invalid");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || url.protocol !== "https:" && !(allowLoopbackHttp && loopback && url.protocol === "http:")) {
    throw new HubStateValidationError("Hub URL must be credential-free HTTPS without path, query, or fragment");
  }
  return url.origin;
}

function exactRecord(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value))) {
    throw new HubStateValidationError(`${label} state has an invalid shape`);
  }
  return value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/v1/") && !value.includes("?") && !value.includes("#");
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function bodyDigest(body: string): string {
  return `sha256:${createHash("sha256").update(body).digest("base64url")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
