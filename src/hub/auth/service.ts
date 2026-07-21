import type { JsonValue, NormalizedApplicationCapability, NormalizedTrustedIdentity } from "../protocol/types.js";
import { HubAuthorizationError } from "./errors.js";
import { normalizeHubRoles, permissionsForHubRoles } from "./role-permissions.js";
import { isHubRole, isStableHubActor, parseHubAuthorizationContextData, parseHubAuthorizationIdentity, parseHubAuthorizationPolicy, parseHubPermission, parseHubPrincipal } from "./schema.js";
import type { HubAuthorizationContext, HubAuthorizationPolicy, HubAuthorizationService, HubPermission, HubPrincipal, HubRole } from "./types.js";

export function createHubAuthorizationService(policyInput: unknown): HubAuthorizationService {
  const policy = parseHubAuthorizationPolicy(policyInput);
  return {
    authorize(identityInput: unknown): HubAuthorizationContext {
      const identity = parseHubAuthorizationIdentity(identityInput);
      const principal = createPrincipal(identity, policy);
      const permissions = permissionsForPrincipal(principal);
      return createContext(principal, permissions);
    }
  };
}

function createPrincipal(identity: NormalizedTrustedIdentity, policy: HubAuthorizationPolicy): HubPrincipal {
  const stableActor = isStableHubActor(identity);
  const roles = normalizeHubRoles([
    ...(stableActor ? policy.actorRoles[identity.actorId] ?? [] : []),
    ...capabilityRoles(identity.appCapabilities, policy.capabilityNamespaces)
  ]);
  return parseHubPrincipal({
    actorId: identity.actorId,
    kind: identity.kind,
    stableActor,
    roles,
    capabilityNamespaces: identity.appCapabilities.map((capability) => capability.name).filter((name) => policy.capabilityNamespaces.includes(name))
  });
}

function capabilityRoles(capabilities: readonly NormalizedApplicationCapability[], allowedNamespaces: readonly string[]): HubRole[] {
  return capabilities
    .filter((capability) => allowedNamespaces.includes(capability.name))
    .flatMap((capability) => capability.grants.flatMap(parseGrantRoles));
}

function parseGrantRoles(grant: { [key: string]: JsonValue }): HubRole[] {
  const keys = Object.keys(grant);
  if (keys.length !== 1 || keys[0] !== "roles" || !Array.isArray(grant.roles) || grant.roles.length === 0 || !grant.roles.every(isHubRole)) {
    return [];
  }
  return [...grant.roles];
}

function permissionsForPrincipal(principal: HubPrincipal): HubPermission[] {
  const permissions = permissionsForHubRoles(principal.roles);
  return principal.stableActor ? permissions : permissions.filter((permission) => permission === "brain:read" || permission === "skill:read");
}

function createContext(principal: HubPrincipal, permissions: readonly HubPermission[]): HubAuthorizationContext {
  const data = parseHubAuthorizationContextData({ principal, permissions });
  const allows = (permission: HubPermission): boolean => data.permissions.includes(parseHubPermission(permission));
  const context: HubAuthorizationContext = {
    ...data,
    allows,
    require(permission: HubPermission): HubAuthorizationContext {
      if (!allows(permission)) throw new HubAuthorizationError(`Actor ${principal.actorId} lacks ${permission}`);
      return context;
    }
  };
  return context;
}
