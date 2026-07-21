import { HubProtocolValidationError } from "./errors.js";
import type { JsonValue, NormalizedApplicationCapability, NormalizedTrustedIdentity, TrustedIdentityInput } from "./types.js";

export function normalizeTrustedIdentity(input: TrustedIdentityInput): NormalizedTrustedIdentity {
  const userLogin = optionalString(input.userLogin)?.toLowerCase();
  const nodeId = optionalString(input.nodeId);
  const displayName = optionalString(input.userDisplayName);
  const nodeName = optionalString(input.nodeName);
  const appCapabilities = normalizeCapabilities(input.appCapabilities);
  if (!userLogin && (!nodeId || appCapabilities.length === 0)) {
    throw new HubProtocolValidationError("Trusted identity requires a user login or a stable capability-bearing node ID");
  }
  const identity: NormalizedTrustedIdentity = {
    actorId: userLogin ? `user:${userLogin}` : `node:${nodeId}`,
    kind: userLogin ? "user" : "node",
    appCapabilities,
    ...(displayName === undefined ? {} : { displayName }),
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(nodeName === undefined ? {} : { nodeName })
  };
  return identity;
}

function normalizeCapabilities(value: unknown): NormalizedApplicationCapability[] {
  if (value === undefined) return [];
  if (!isRecord(value)) throw new HubProtocolValidationError("Application capabilities must be a trusted capability record");
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([name, claims]) => {
    if (!/^[a-z0-9.-]+\/cap\/[a-z0-9._-]+$/.test(name) || !Array.isArray(claims)) {
      throw new HubProtocolValidationError("Application capabilities must use domain-scoped names and grant arrays");
    }
    const grants = claims.map((claim) => normalizeGrant(claim));
    const unique = new Map(grants.map((grant) => [JSON.stringify(grant), grant]));
    return { name, grants: [...unique.values()] };
  });
}

function normalizeGrant(value: unknown): { [key: string]: JsonValue } {
  if (!isRecord(value)) throw new HubProtocolValidationError("Application capability grants must be JSON objects");
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalizeJson(item, 0)]));
}

function normalizeJson(value: unknown, depth: number): JsonValue {
  if (depth > 8) throw new HubProtocolValidationError("Application capability grant nesting is too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item, depth + 1));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalizeJson(item, depth + 1)]));
  }
  throw new HubProtocolValidationError("Application capability grants must contain JSON values");
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HubProtocolValidationError("Trusted identity fields must be non-empty strings");
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
