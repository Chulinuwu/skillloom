import type { NormalizedTrustedIdentity } from "../protocol/types.js";

export type HubRole = "reader" | "contributor" | "promoter" | "admin";

export type HubPermission =
  | "brain:read"
  | "brain:capture"
  | "brain:update"
  | "brain:link"
  | "skill:read"
  | "skill:propose"
  | "skill:publish"
  | "hub:admin";

export type HubAuthorizationPolicy = {
  actorRoles: Record<string, readonly HubRole[]>;
  capabilityNamespaces: readonly string[];
};

export type HubPrincipal = {
  actorId: string;
  kind: NormalizedTrustedIdentity["kind"];
  stableActor: boolean;
  roles: readonly HubRole[];
  capabilityNamespaces: readonly string[];
};

export type HubAuthorizationContextData = {
  principal: HubPrincipal;
  permissions: readonly HubPermission[];
};

export type HubAuthorizationContext = HubAuthorizationContextData & {
  allows(permission: HubPermission): boolean;
  require(permission: HubPermission): HubAuthorizationContext;
};

export type HubAuthorizationService = {
  authorize(identity: unknown): HubAuthorizationContext;
};
