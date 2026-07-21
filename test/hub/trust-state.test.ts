import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  HubTrustChangedError,
  HubTrustNotEstablishedError,
  establishHubTrust,
  verifyHubTrust
} from "../../src/hub/client/index.js";
import {
  acknowledgePendingMutation,
  enqueuePendingMutation,
  hubClientLayout,
  migrateLegacyHubState,
  readHubEndpoint,
  readHubPendingMutations,
  readHubSyncState,
  readHubTrust,
  writeHubEndpoint,
  writeHubSyncState,
  writeHubTrust
} from "../../src/hub/config/index.js";
import { tempDir } from "../helpers/fixtures.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function key(): string {
  return generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
}

const handshake = (releaseSigningPublicKey = key()) => ({
  hubInstanceId: "hub-primary",
  releaseSigningPublicKey
});

test("only explicit setup establishes trust and changes fail closed", () => {
  const first = handshake();
  assert.throws(() => verifyHubTrust(null, first), HubTrustNotEstablishedError);
  const trust = establishHubTrust(first, { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" });
  assert.equal(verifyHubTrust(trust, first), trust);
  assert.throws(() => verifyHubTrust(trust, { ...first, hubInstanceId: "hub-replaced" }), HubTrustChangedError);
  assert.throws(() => verifyHubTrust(trust, handshake()), HubTrustChangedError);
});

test("persists trust, endpoint, and sync independently with strict schemas", async () => {
  const root = await tempDir("skillloom-hub-state-");
  const trust = establishHubTrust(handshake(), { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" });
  await writeHubTrust(root, trust);
  await writeHubEndpoint(root, {
    version: 1,
    source: "service",
    serviceName: "svc:skillloom",
    url: "https://skillloom.tailnet.ts.net",
    verifiedAt: "2026-07-21T00:00:00.000Z"
  });
  await writeHubSyncState(root, { version: 1, lastEventSequence: "900719925474099312345" });
  assert.deepEqual(await readHubTrust(root), trust);
  assert.equal((await readHubEndpoint(root))?.url, "https://skillloom.tailnet.ts.net");
  assert.equal((await readHubSyncState(root)).lastEventSequence, "900719925474099312345");
  assert.equal((await stat(hubClientLayout(root).root)).mode & 0o777, 0o700);
  for (const statePath of [hubClientLayout(root).trust, hubClientLayout(root).endpoint, hubClientLayout(root).sync]) {
    assert.equal((await stat(statePath)).mode & 0o777, 0o600);
  }

  const path = hubClientLayout(root).sync;
  await writeFile(path, "{\"version\":1,\"lastEventSequence\":1}\n");
  await assert.rejects(() => readHubSyncState(root));
});

test("migrates legacy sync and cache without migrating URL tokens or trust", async () => {
  const root = await tempDir("skillloom-hub-migrate-");
  await migrateLegacyHubState(root, {
    version: 0,
    serviceName: "svc:skillloom",
    endpoint: "https://skillloom.tailnet.ts.net",
    latestEventSequence: 42,
    token: "must-not-persist",
    hubInstanceId: "must-not-be-trusted"
  }, "2026-07-21T00:00:00.000Z");
  assert.equal((await readHubSyncState(root)).lastEventSequence, "42");
  assert.equal((await readHubEndpoint(root))?.serviceName, "svc:skillloom");
  assert.equal(await readHubTrust(root), null);
  const endpointJson = await readFile(hubClientLayout(root).endpoint, "utf8");
  assert.doesNotMatch(endpointJson, /token|must-not-persist|hubInstanceId/);
});

test("durably preserves request ID and body hash until a validated acknowledgement", async () => {
  const root = await tempDir("skillloom-hub-pending-");
  const pending = await enqueuePendingMutation(root, {
    requestId: REQUEST_ID,
    method: "POST",
    path: "/v1/brain/capture",
    body: "{\"content\":\"hello\"}",
    createdAt: "2026-07-21T00:00:00.000Z"
  });
  assert.match(pending.bodyHash, /^sha256:/);
  assert.equal((await readHubPendingMutations(root))[0]?.requestId, REQUEST_ID);
  assert.equal((await stat(hubClientLayout(root).pending)).mode & 0o777, 0o700);
  const [pendingName] = await readdir(hubClientLayout(root).pending);
  assert.equal((await stat(join(hubClientLayout(root).pending, pendingName ?? "missing"))).mode & 0o777, 0o600);
  await assert.rejects(() => acknowledgePendingMutation(root, REQUEST_ID, { requestId: "22222222-2222-4222-8222-222222222222", accepted: true, data: {} }));
  assert.equal((await readHubPendingMutations(root)).length, 1);
  await acknowledgePendingMutation(root, REQUEST_ID, { requestId: REQUEST_ID, accepted: true, data: {} });
  assert.deepEqual(await readHubPendingMutations(root), []);

  await mkdir(hubClientLayout(root).pending, { recursive: true });
  await writeFile(join(hubClientLayout(root).pending, "bad.json"), "{}\n");
  await assert.rejects(() => readHubPendingMutations(root));
});

test("rejects non-UUID request IDs and unversioned mutation paths", async () => {
  const root = await tempDir("skillloom-hub-pending-invalid-");
  await assert.rejects(() => enqueuePendingMutation(root, {
    requestId: "request-1",
    method: "POST",
    path: "/v1/brain/capture",
    body: "{}",
    createdAt: "2026-07-21T00:00:00.000Z"
  }));
  await assert.rejects(() => enqueuePendingMutation(root, {
    requestId: REQUEST_ID,
    method: "POST",
    path: "/brain/capture",
    body: "{}",
    createdAt: "2026-07-21T00:00:00.000Z"
  }));
});
