import assert from "node:assert/strict";
import test from "node:test";
import {
  HubAuthorizationError,
  createHubAuthorizationService,
  type HubAuthorizationPolicy,
  type HubPermission,
  type HubRole
} from "../../src/hub/auth/index.js";
import type { JsonValue, NormalizedTrustedIdentity } from "../../src/hub/protocol/index.js";

const permissionsByRole: Record<HubRole, readonly HubPermission[]> = {
  reader: ["brain:read", "skill:read"],
  contributor: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose"],
  promoter: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish"],
  admin: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish", "hub:admin"]
};

const policy: HubAuthorizationPolicy = {
  actorRoles: {
    "user:reader@example.com": ["reader"],
    "user:contributor@example.com": ["contributor"],
    "user:promoter@example.com": ["promoter"],
    "user:admin@example.com": ["admin"]
  },
  capabilityNamespaces: ["example.com/cap/skillloom"]
};

function identity(actorId: string, roles: Array<{ [key: string]: JsonValue }> = []): NormalizedTrustedIdentity {
  const [kind, suffix] = actorId.split(":", 2);
  return {
    actorId,
    kind: kind === "user" ? "user" : "node",
    ...(kind === "node" ? { nodeId: suffix } : {}),
    appCapabilities: roles.length === 0 ? [] : [{
      name: "example.com/cap/skillloom",
      grants: roles
    }]
  };
}

test("maps every role to its exact hierarchical permission set", () => {
  const service = createHubAuthorizationService(policy);
  for (const role of Object.keys(permissionsByRole) as HubRole[]) {
    const context = service.authorize(identity(`user:${role}@example.com`));
    assert.deepEqual(context.principal.roles, [role]);
    assert.deepEqual(context.permissions, permissionsByRole[role]);
  }
});

test("derives allowed capability roles only from configured namespaces", () => {
  const service = createHubAuthorizationService(policy);
  const context = service.authorize(identity("node:agent-42", [{ roles: ["contributor"] }]));
  assert.deepEqual(context.principal.roles, ["contributor"]);
  assert.equal(context.principal.stableActor, true);
  assert.equal(context.allows("brain:capture"), true);
  assert.equal(context.allows("skill:publish"), false);
});

test("fails closed for unknown namespaces, roles, and malformed capability grants", () => {
  const service = createHubAuthorizationService(policy);
  const unknownNamespace = identity("node:agent-42", [{ roles: ["admin"] }]);
  unknownNamespace.appCapabilities[0]!.name = "attacker.example/cap/skillloom";
  assert.deepEqual(service.authorize(unknownNamespace).permissions, []);

  const unknownRole = identity("node:agent-42", [{ roles: ["admin", "owner"] }]);
  assert.deepEqual(service.authorize(unknownRole).permissions, []);

  const malformedGrant = identity("node:agent-42", [{ roles: "admin" }]);
  assert.deepEqual(service.authorize(malformedGrant).permissions, []);
});

test("requires a stable actor for mutation and publish permissions", () => {
  const service = createHubAuthorizationService(policy);
  const unstableCapabilityOnlyIdentity = {
    actorId: "node:unbound",
    kind: "node",
    nodeId: "agent-42",
    appCapabilities: [{
      name: "example.com/cap/skillloom",
      grants: [{ roles: ["promoter"] }]
    }]
  };
  const context = service.authorize(unstableCapabilityOnlyIdentity);
  assert.equal(context.principal.stableActor, false);
  assert.deepEqual(context.permissions, permissionsByRole.reader);
  assert.throws(() => context.require("skill:publish"), HubAuthorizationError);
});

test("rejects invalid policy roles and require exposes no transport concerns", () => {
  assert.throws(() => createHubAuthorizationService({
    actorRoles: { "user:owner@example.com": ["owner"] },
    capabilityNamespaces: ["example.com/cap/skillloom"]
  }), HubAuthorizationError);
  const context = createHubAuthorizationService(policy).authorize(identity("user:reader@example.com"));
  assert.equal(context.require("brain:read"), context);
  assert.throws(() => context.require("brain:update"), HubAuthorizationError);
});
