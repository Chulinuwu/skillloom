import {
  HubClientVersionUnsupportedError,
  HubProtocolValidationError,
  IncompatibleHubProtocolError
} from "./errors.js";
import { canonicalSigningKeyFingerprint } from "./signing-key.js";
import type { NegotiationCompatibility, NegotiationResponse, TailnetIdentity } from "./types.js";
import { isCanonicalEventSequence } from "./version.js";

export function parseNegotiationResponse(value: unknown, compatibility: NegotiationCompatibility): NegotiationResponse {
  if (!isRecord(value)) throw new HubProtocolValidationError("Negotiation response must be an object");
  const protocolVersion = requiredVersion(value.protocolVersion, "protocolVersion");
  const minimumClientVersion = requiredVersion(value.minimumClientVersion, "minimumClientVersion");
  if (major(protocolVersion) !== major(compatibility.protocolVersion)) {
    throw new IncompatibleHubProtocolError(compatibility.protocolVersion, protocolVersion);
  }
  if (compareVersions(compatibility.clientVersion, minimumClientVersion) < 0) {
    throw new HubClientVersionUnsupportedError(compatibility.clientVersion, minimumClientVersion);
  }
  const releaseSigningPublicKey = requiredString(value.releaseSigningPublicKey, "releaseSigningPublicKey");
  canonicalSigningKeyFingerprint(releaseSigningPublicKey);
  if (!isCanonicalEventSequence(value.latestEventSequence)) {
    throw new HubProtocolValidationError("latestEventSequence must be a canonical nonnegative decimal string");
  }
  return {
    protocolVersion,
    minimumClientVersion,
    hubInstanceId: requiredString(value.hubInstanceId, "hubInstanceId"),
    tailnetIdentity: parseTailnetIdentity(value.tailnetIdentity),
    grantedCapabilities: stringArray(value.grantedCapabilities, "grantedCapabilities"),
    releaseSigningPublicKey,
    latestEventSequence: value.latestEventSequence
  };
}

function parseTailnetIdentity(value: unknown): TailnetIdentity {
  if (!isRecord(value)) throw new HubProtocolValidationError("tailnetIdentity must be an object");
  const kind = value.kind;
  if (kind !== "user" && kind !== "node") throw new HubProtocolValidationError("tailnetIdentity.kind is invalid");
  const actorId = requiredString(value.actorId, "tailnetIdentity.actorId");
  if (!actorId.startsWith(`${kind}:`)) throw new HubProtocolValidationError("tailnetIdentity.actorId does not match its kind");
  const displayName = optionalString(value.displayName, "tailnetIdentity.displayName");
  const nodeId = optionalString(value.nodeId, "tailnetIdentity.nodeId");
  const nodeName = optionalString(value.nodeName, "tailnetIdentity.nodeName");
  return {
    actorId,
    kind,
    ...(displayName === undefined ? {} : { displayName }),
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(nodeName === undefined ? {} : { nodeName })
  };
}

function requiredVersion(value: unknown, field: string): string {
  const version = requiredString(value, field);
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new HubProtocolValidationError(`${field} must be a numeric version`);
  return version;
}

function compareVersions(left: string, right: string): number {
  const a = numericVersion(left);
  const b = numericVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

function major(version: string): number {
  return numericVersion(version)[0] ?? 0;
}

function numericVersion(version: string): number[] {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new HubProtocolValidationError(`Invalid version ${version}`);
  return version.split(".").map(Number);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new HubProtocolValidationError(`${field} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new HubProtocolValidationError(`${field} must be a string array`);
  }
  return [...new Set(value.map((item) => item.trim()))].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
