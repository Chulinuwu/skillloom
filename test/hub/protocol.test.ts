import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  HubProtocolValidationError,
  IncompatibleHubProtocolError,
  canonicalSigningKeyFingerprint,
  normalizeTrustedIdentity,
  parseNegotiationResponse
} from "../../src/hub/protocol/index.js";

function publicKey(): string {
  return generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
}

test("parses a compatible negotiation response with a decimal event cursor", () => {
  const response = parseNegotiationResponse({
    protocolVersion: "1.2",
    minimumClientVersion: "0.2.0",
    hubInstanceId: "hub-primary",
    tailnetIdentity: { actorId: "user:owner@example.com", kind: "user", displayName: "Owner" },
    grantedCapabilities: ["brain:read", "brain:write"],
    releaseSigningPublicKey: publicKey(),
    latestEventSequence: "900719925474099312345"
  }, { clientVersion: "0.2.1", protocolVersion: "1.0" });
  assert.equal(response.latestEventSequence, "900719925474099312345");
  assert.match(canonicalSigningKeyFingerprint(response.releaseSigningPublicKey), /^sha256:[A-Za-z0-9_-]{43}$/);
});

test("rejects a Hub with an incompatible protocol major", () => {
  assert.throws(() => parseNegotiationResponse({
    protocolVersion: "2.0",
    minimumClientVersion: "0.2.0",
    hubInstanceId: "hub-primary",
    tailnetIdentity: { actorId: "user:owner@example.com", kind: "user" },
    grantedCapabilities: [],
    releaseSigningPublicKey: publicKey(),
    latestEventSequence: "0"
  }, { clientVersion: "0.2.1", protocolVersion: "1.0" }), IncompatibleHubProtocolError);
});

test("rejects numeric and non-canonical event cursors", () => {
  const base = {
    protocolVersion: "1.0",
    minimumClientVersion: "0.2.0",
    hubInstanceId: "hub-primary",
    tailnetIdentity: { actorId: "user:owner@example.com", kind: "user" },
    grantedCapabilities: [],
    releaseSigningPublicKey: publicKey()
  };
  assert.throws(() => parseNegotiationResponse({ ...base, latestEventSequence: 1 }, { clientVersion: "0.2.1", protocolVersion: "1.0" }), HubProtocolValidationError);
  assert.throws(() => parseNegotiationResponse({ ...base, latestEventSequence: "01" }, { clientVersion: "0.2.1", protocolVersion: "1.0" }), HubProtocolValidationError);
});

test("normalizes trusted user and application capability identity", () => {
  assert.deepEqual(normalizeTrustedIdentity({
    userLogin: " Owner@Example.com ",
    userDisplayName: " Owner ",
    nodeId: "node-123",
    nodeName: "runner",
    appCapabilities: {
      "example.com/cap/skillloom": [
        { roles: ["contributor", "reader"] },
        { roles: ["contributor", "reader"] }
      ]
    }
  }), {
    actorId: "user:owner@example.com",
    kind: "user",
    displayName: "Owner",
    nodeId: "node-123",
    nodeName: "runner",
    appCapabilities: [{
      name: "example.com/cap/skillloom",
      grants: [{ roles: ["contributor", "reader"] }]
    }]
  });
});

test("requires a stable node actor for capability-only identity", () => {
  assert.throws(() => normalizeTrustedIdentity({
    appCapabilities: { "example.com/cap/skillloom": [{ roles: ["contributor"] }] }
  }), HubProtocolValidationError);
  assert.equal(normalizeTrustedIdentity({
    nodeId: "n123",
    appCapabilities: { "example.com/cap/skillloom": [{ roles: ["contributor"] }] }
  }).actorId, "node:n123");
});
