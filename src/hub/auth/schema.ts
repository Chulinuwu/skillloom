import type { JsonValue, NormalizedApplicationCapability, NormalizedTrustedIdentity } from "../protocol/types.js";
import { HubAuthorizationError } from "./errors.js";
import { hubPermissions, hubRoles } from "./role-permissions.js";
import type { HubAuthorizationContextData, HubAuthorizationPolicy, HubPermission, HubPrincipal, HubRole } from "./types.js";

const capabilityNamePattern = /^[a-z0-9.-]+\/cap\/[a-z0-9._-]+$/;

export function parseHubAuthorizationPolicy(value: unknown): HubAuthorizationPolicy {
  const record = requiredRecord(value, "Hub authorization policy");
  requireExactKeys(record, ["actorRoles", "capabilityNamespaces"], "Hub authorization policy");
  const actorRoles = parseActorRoles(record.actorRoles);
  const capabilityNamespaces = parseCapabilityNamespaces(record.capabilityNamespaces);
  return { actorRoles, capabilityNamespaces };
}

export function parseHubAuthorizationIdentity(value: unknown): NormalizedTrustedIdentity {
  const record = requiredRecord(value, "Trusted identity");
  const actorId = requiredString(record.actorId, "Trusted identity actorId");
  const kind = record.kind;
  if (kind !== "user" && kind !== "node") throw new HubAuthorizationError("Trusted identity kind is invalid");
  if (!Array.isArray(record.appCapabilities)) throw new HubAuthorizationError("Trusted identity capabilities are invalid");
  const appCapabilities = record.appCapabilities.map(parseCapability);
  const displayName = optionalString(record.displayName, "Trusted identity displayName");
  const nodeId = optionalString(record.nodeId, "Trusted identity nodeId");
  const nodeName = optionalString(record.nodeName, "Trusted identity nodeName");
  return {
    actorId,
    kind,
    appCapabilities,
    ...(displayName === undefined ? {} : { displayName }),
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(nodeName === undefined ? {} : { nodeName })
  };
}

export function parseHubPrincipal(value: unknown): HubPrincipal {
  const record = requiredRecord(value, "Hub principal");
  requireExactKeys(record, ["actorId", "kind", "stableActor", "roles", "capabilityNamespaces"], "Hub principal");
  const actorId = requiredString(record.actorId, "Hub principal actorId");
  const kind = record.kind;
  if (kind !== "user" && kind !== "node") throw new HubAuthorizationError("Hub principal kind is invalid");
  if (typeof record.stableActor !== "boolean") throw new HubAuthorizationError("Hub principal stableActor is invalid");
  if (!Array.isArray(record.roles) || !record.roles.every(isHubRole)) throw new HubAuthorizationError("Hub principal roles are invalid");
  if (!Array.isArray(record.capabilityNamespaces) || !record.capabilityNamespaces.every(isCapabilityName)) {
    throw new HubAuthorizationError("Hub principal capability namespaces are invalid");
  }
  return {
    actorId,
    kind,
    stableActor: record.stableActor,
    roles: [...record.roles],
    capabilityNamespaces: [...record.capabilityNamespaces]
  };
}

export function parseHubAuthorizationContextData(value: unknown): HubAuthorizationContextData {
  const record = requiredRecord(value, "Hub authorization context");
  requireExactKeys(record, ["principal", "permissions"], "Hub authorization context");
  if (!Array.isArray(record.permissions) || !record.permissions.every(isHubPermission)) {
    throw new HubAuthorizationError("Hub authorization context permissions are invalid");
  }
  return {
    principal: parseHubPrincipal(record.principal),
    permissions: [...new Set(record.permissions)]
  };
}

export function parseHubPermission(value: unknown): HubPermission {
  if (!isHubPermission(value)) throw new HubAuthorizationError("Hub permission is invalid");
  return value;
}

export function isHubRole(value: unknown): value is HubRole {
  return typeof value === "string" && hubRoles.some((role) => role === value);
}

export function isStableHubActor(identity: NormalizedTrustedIdentity): boolean {
  if (identity.kind === "user") return /^user:[^\s:][^\s]*$/.test(identity.actorId);
  return identity.nodeId !== undefined && identity.nodeId.length > 0 && identity.actorId === `node:${identity.nodeId}`;
}

function parseActorRoles(value: unknown): Record<string, readonly HubRole[]> {
  const record = requiredRecord(value, "Hub authorization actor roles");
  return Object.fromEntries(Object.entries(record).map(([actorId, roles]) => {
    if (!/^user:[^\s:][^\s]*$|^node:[^\s:][^\s]*$/.test(actorId)) {
      throw new HubAuthorizationError("Hub authorization actor role key is invalid");
    }
    if (!Array.isArray(roles) || roles.length === 0 || !roles.every(isHubRole)) {
      throw new HubAuthorizationError("Hub authorization actor roles are invalid");
    }
    return [actorId, [...roles]];
  }));
}

function parseCapabilityNamespaces(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCapabilityName)) {
    throw new HubAuthorizationError("Hub authorization capability namespaces are invalid");
  }
  return [...new Set(value)].sort();
}

function parseCapability(value: unknown): NormalizedApplicationCapability {
  const record = requiredRecord(value, "Trusted identity capability");
  requireExactKeys(record, ["name", "grants"], "Trusted identity capability");
  const name = requiredString(record.name, "Trusted identity capability name");
  if (!isCapabilityName(name)) throw new HubAuthorizationError("Trusted identity capability name is invalid");
  if (!Array.isArray(record.grants)) throw new HubAuthorizationError("Trusted identity capability grants are invalid");
  const grants = record.grants.map((grant) => parseJsonRecord(grant, "Trusted identity capability grant"));
  return { name, grants };
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new HubAuthorizationError(`${field} must be an object`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value))) {
    throw new HubAuthorizationError(`${field} fields are invalid`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new HubAuthorizationError(`${field} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function isCapabilityName(value: unknown): value is string {
  return typeof value === "string" && capabilityNamePattern.test(value);
}

function isHubPermission(value: unknown): value is HubPermission {
  return typeof value === "string" && hubPermissions.some((permission) => permission === value);
}

function parseJsonRecord(value: unknown, field: string): { [key: string]: JsonValue } {
  const record = requiredRecord(value, field);
  return parseJsonRecordAtDepth(record, field, 0);
}

function parseJsonRecordAtDepth(value: Record<string, unknown>, field: string, depth: number): { [key: string]: JsonValue } {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseJsonValue(item, field, depth)]));
}

function parseJsonValue(value: unknown, field: string, depth: number): JsonValue {
  if (depth > 8) throw new HubAuthorizationError(`${field} nesting is invalid`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => parseJsonValue(item, field, depth + 1));
  if (isRecord(value)) return parseJsonRecordAtDepth(value, field, depth + 1);
  throw new HubAuthorizationError(`${field} JSON value is invalid`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
