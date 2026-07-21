import type { HubPermission, HubRole } from "./types.js";

const roleOrder: readonly HubRole[] = ["reader", "contributor", "promoter", "admin"];

const permissionsByRole: Readonly<Record<HubRole, readonly HubPermission[]>> = {
  reader: ["brain:read", "skill:read"],
  contributor: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose"],
  promoter: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish"],
  admin: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish", "hub:admin"]
};

export const hubRoles: readonly HubRole[] = roleOrder;

export const hubPermissions: readonly HubPermission[] = permissionsByRole.admin;

export function normalizeHubRoles(roles: Iterable<HubRole>): HubRole[] {
  const unique = new Set(roles);
  return roleOrder.filter((role) => unique.has(role));
}

export function permissionsForHubRoles(roles: Iterable<HubRole>): HubPermission[] {
  const grantedRoles = new Set(roles);
  return hubPermissions.filter((permission) => roleOrder.some((role) => grantedRoles.has(role) && permissionsByRole[role].includes(permission)));
}
