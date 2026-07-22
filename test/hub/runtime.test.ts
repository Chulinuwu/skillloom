import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import test from "node:test";
import { loadHubRuntimeConfig } from "../../src/hub/runtime/config.js";
import { createAuthoringSyncLoop, type AuthoringSyncPort } from "../../src/hub/runtime/authoring-loop.js";
import { runWithHubAuthorizationContext } from "../../src/hub/runtime/auth-context.js";
import { OBSIDIAN_AUTHORING_ACTOR_ID, createRuntimeBrainPermissions, createRuntimeRegistryPermissions } from "../../src/hub/runtime/permissions.js";
import { createHubRuntime } from "../../src/hub/runtime/service.js";
import { loadHubRuntimeState } from "../../src/hub/runtime/state.js";
import { authorizeTailscaleServeRequest } from "../../src/hub/tailscale/headers.js";
import type { BrainDerivedProjectionPort } from "../../src/hub/brain/index.js";
import { createHubAuthorizationService, HubAuthorizationError, type HubAuthorizationContext, type HubRole } from "../../src/hub/auth/index.js";
import { HUB_PROTOCOL_VERSION, parseNegotiationResponse } from "../../src/hub/protocol/index.js";
import { tempDir } from "../helpers/fixtures.js";

const appCapability = "skillloom.io/cap/skillloom";
class FailingRuntimeProjection implements BrainDerivedProjectionPort {
  dirty = false;
  initialized = false;
  async initialize(): Promise<void> {
    this.initialized = true;
    throw new Error("projection init failed");
  }
  async markDirty(): Promise<void> {
    this.dirty = true;
  }
  async refresh(): Promise<void> {
    throw new Error("projection refresh failed");
  }
}

test("runtime config refuses non-loopback binds", () => {
  assert.throws(() => loadHubRuntimeConfig({
    SKILLLOOM_HUB_BIND_HOST: "0.0.0.0",
    SKILLLOOM_HUB_PORT: "8787",
    SKILLLOOM_HUB_DATA_DIR: "/tmp/skillloom"
  }), /127\.0\.0\.1/u);
});

test("runtime config enables bounded Obsidian authoring sync by default", () => {
  const config = loadHubRuntimeConfig({ SKILLLOOM_HUB_DATA_DIR: "/tmp/skillloom" });
  assert.equal(config.obsidianAuthoringEnabled, true);
  assert.equal(config.obsidianAuthoringIntervalMs, 1000);
  assert.equal(loadHubRuntimeConfig({
    SKILLLOOM_HUB_DATA_DIR: "/tmp/skillloom",
    SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED: "false",
    SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS: "250"
  }).obsidianAuthoringEnabled, false);
  assert.throws(() => loadHubRuntimeConfig({
    SKILLLOOM_HUB_DATA_DIR: "/tmp/skillloom",
    SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED: "yes"
  }), /must be true or false/u);
  assert.throws(() => loadHubRuntimeConfig({
    SKILLLOOM_HUB_DATA_DIR: "/tmp/skillloom",
    SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS: "249"
  }), /250 to 3600000/u);
});

test("runtime state creates one persistent Hub UUID and Ed25519 key with private modes", async () => {
  const root = await tempDir("skillloom-runtime-state-");
  const first = await loadHubRuntimeState(root);
  const second = await loadHubRuntimeState(root);
  assert.equal(second.hubInstanceId, first.hubInstanceId);
  assert.equal(second.signer.publicKey, first.signer.publicKey);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, "runtime", "hub-instance-id"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, "runtime", "registry-signing-key.pem"))).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, "brain"))).mode & 0o777, 0o700);
  assert.equal((await stat(join(root, "registry"))).mode & 0o777, 0o700);
});

test("Tailscale Serve headers derive users from login and reject malformed or conflicting grants", () => {
  const user = authorizeTailscaleServeRequest(fakeRequest("alice@example.com", [{ roles: ["contributor"] }]), { appCapability });
  assert.equal(user.principal.actorId, "user:alice@example.com");
  assert.deepEqual(user.principal.roles, ["contributor"]);
  const agent = authorizeTailscaleServeRequest(fakeRequest(undefined, [{ subject: "node:skillloom-agent", roles: ["reader", "contributor"] }]), { appCapability });
  assert.equal(agent.principal.actorId, "node:skillloom-agent");
  assert.deepEqual(agent.principal.roles, ["reader", "contributor"]);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest(undefined, [{ roles: ["reader"] }]), { appCapability }), /subject/u);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest("tag:skillloom-agent", [{ subject: "node:skillloom-agent", roles: ["reader"] }]), { appCapability }), /not trusted/u);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest(undefined, [
    { subject: "node:skillloom-agent", roles: ["reader"] },
    { subject: "node:other-agent", roles: ["reader"] }
  ]), { appCapability }), /subject/u);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest("alice@example.com", [{ roles: ["reader"] }, { roles: ["admin"] }]), { appCapability }), /conflict/u);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest("alice@example.com", [{ subject: "node:skillloom-agent", roles: ["reader"] }]), { appCapability }), /login actor/u);
  assert.throws(() => authorizeTailscaleServeRequest(fakeRequest("alice@example.com", [{ roles: ["owner"] }]), { appCapability }), /roles/u);
});

test("runtime permission ports enforce actor authorization at service boundary", async () => {
  const reader = authorize("user:reader@example.com", ["reader"]);
  const contributor = authorize("user:contributor@example.com", ["contributor"]);
  const promoter = authorize("user:promoter@example.com", ["promoter"]);
  const brain = createRuntimeBrainPermissions();
  const registry = createRuntimeRegistryPermissions();
  await runWithHubAuthorizationContext(reader, async () => await brain.requireRead({ actorId: reader.principal.actorId }));
  await runWithHubAuthorizationContext(contributor, async () => await brain.requireWrite({ actorId: contributor.principal.actorId }, "capture"));
  await runWithHubAuthorizationContext(contributor, async () => await registry.requirePropose({ actorId: contributor.principal.actorId }));
  await runWithHubAuthorizationContext(promoter, async () => await registry.requirePublish({ actorId: promoter.principal.actorId }));
  await assert.rejects(() => runWithHubAuthorizationContext(reader, async () => await brain.requireWrite({ actorId: reader.principal.actorId }, "update")), HubAuthorizationError);
  await assert.rejects(() => runWithHubAuthorizationContext(contributor, async () => await registry.requirePublish({ actorId: contributor.principal.actorId })), HubAuthorizationError);
  await assert.rejects(() => runWithHubAuthorizationContext(reader, async () => await brain.requireRead({ actorId: "user:missing@example.com" })), HubAuthorizationError);
  await assert.rejects(() => brain.requireRead({ actorId: "user:missing@example.com" }), HubAuthorizationError);
});

test("local Obsidian authoring actor has only the Brain rights required by in-process sync", async () => {
  const actor = { actorId: OBSIDIAN_AUTHORING_ACTOR_ID };
  const brain = createRuntimeBrainPermissions();
  const registry = createRuntimeRegistryPermissions();
  await brain.requireRead(actor);
  await brain.requireWrite(actor, "capture");
  await brain.requireWrite(actor, "update");
  const forgedRequest = authorize("user:reader@example.com", ["reader"]);
  await assert.rejects(
    () => runWithHubAuthorizationContext(forgedRequest, async () => await brain.requireRead(actor)),
    HubAuthorizationError
  );
  await assert.rejects(
    () => runWithHubAuthorizationContext(forgedRequest, async () => await brain.requireWrite(actor, "capture")),
    HubAuthorizationError
  );
  await assert.rejects(() => brain.requireWrite(actor, "link"), HubAuthorizationError);
  await assert.rejects(() => registry.requirePropose(actor), HubAuthorizationError);
  await assert.rejects(() => registry.requirePublish(actor), HubAuthorizationError);
});

test("authoring loop retries failures without overlap and stops cleanly", async () => {
  let initializeAttempts = 0;
  let syncAttempts = 0;
  let active = 0;
  let maxActive = 0;
  const errors: unknown[] = [];
  const authoring: AuthoringSyncPort = {
    async initialize(): Promise<void> {
      initializeAttempts += 1;
      if (initializeAttempts === 1) throw new Error("transient initialize failure");
    },
    async sync(): Promise<void> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      syncAttempts += 1;
      active -= 1;
    }
  };
  const loop = createAuthoringSyncLoop(authoring, 250, (error) => errors.push(error));
  loop.start();
  await waitFor(() => syncAttempts === 1, 1000);
  assert.equal(initializeAttempts, 2);
  assert.equal(errors.length, 1);
  assert.equal(maxActive, 1);
  await loop.close();
  const stoppedAt = syncAttempts;
  await delay(300);
  assert.equal(syncAttempts, stoppedAt);
});
test("runtime authorization context isolates concurrent grants for the same actor", async () => {
  const actorId = "user:shared@example.com";
  const reader = authorize(actorId, ["reader"]);
  const contributor = authorize(actorId, ["contributor"]);
  const brain = createRuntimeBrainPermissions();
  let releaseContributor!: () => void;
  const contributorCanFinish = new Promise<void>((resolve) => {
    releaseContributor = resolve;
  });
  const readerAttempt = runWithHubAuthorizationContext(reader, async () => {
    await contributorCanFinish;
    await brain.requireWrite({ actorId }, "capture");
  });
  const contributorAttempt = runWithHubAuthorizationContext(contributor, async () => {
    await brain.requireWrite({ actorId }, "capture");
    releaseContributor();
  });
  await contributorAttempt;
  await assert.rejects(() => readerAttempt, HubAuthorizationError);
});


test("runtime server serves unauthenticated health and authenticated hello across restart", async () => {
  const port = await freePort();
  const dataDir = await tempDir("skillloom-runtime-http-");
  const env = {
    SKILLLOOM_HUB_BIND_HOST: "127.0.0.1",
    SKILLLOOM_HUB_PORT: String(port),
    SKILLLOOM_HUB_DATA_DIR: dataDir,
    SKILLLOOM_HUB_APP_CAP: appCapability
  };
  const first = await createHubRuntime(env);
  await first.start();
  try {
    assert.deepEqual(await getJson(port, "/healthz"), { status: 200, body: { data: { status: "ok" } } });
    const hello = await getJson(port, "/v1/hello", authHeaders("alice@example.com", [{ roles: ["reader"] }]));
    assert.equal(hello.status, 200);
    const negotiated = parseNegotiationResponse(hello.body, { clientVersion: "0.2.1", protocolVersion: HUB_PROTOCOL_VERSION });
    assert.equal(negotiated.hubInstanceId, first.hubInstanceId);
    assert.equal(negotiated.releaseSigningPublicKey, first.signingPublicKey.trim());
    assert.equal(negotiated.tailnetIdentity.actorId, "user:alice@example.com");
    assert.deepEqual(negotiated.grantedCapabilities, ["brain:read", "skill:read"]);
    assert.equal(negotiated.latestEventSequence, "0");
    assert.equal((await getJson(port, "/v1/hello")).status, 401);
  } finally {
    await first.close();
  }
  const second = await createHubRuntime(env);
  assert.equal(second.hubInstanceId, first.hubInstanceId);
  assert.equal(second.signingPublicKey, first.signingPublicKey);
  await second.close();
});

test("runtime keeps HTTP healthy while authoring sync retries and stops the loop on close", async () => {
  const port = await freePort();
  const dataDir = await tempDir("skillloom-runtime-authoring-");
  let syncAttempts = 0;
  const errors: unknown[] = [];
  const authoringSync: AuthoringSyncPort = {
    async sync(): Promise<void> {
      syncAttempts += 1;
      if (syncAttempts === 1) throw new Error("transient authoring failure");
    }
  };
  const runtime = await createHubRuntime({
    SKILLLOOM_HUB_BIND_HOST: "127.0.0.1",
    SKILLLOOM_HUB_PORT: String(port),
    SKILLLOOM_HUB_DATA_DIR: dataDir,
    SKILLLOOM_HUB_APP_CAP: appCapability,
    SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS: "250"
  }, { authoringSync, onAuthoringError: (error) => errors.push(error) });
  await runtime.start();
  try {
    await waitFor(() => errors.length === 1, 1000);
    assert.deepEqual(await getJson(port, "/healthz"), { status: 200, body: { data: { status: "ok" } } });
    await waitFor(() => syncAttempts === 2, 1000);
  } finally {
    await runtime.close();
  }
  const stoppedAt = syncAttempts;
  await delay(300);
  assert.equal(syncAttempts, stoppedAt);
});

test("runtime refreshes Obsidian projection after brain mutations and recovers across restart", async () => {
  const port = await freePort();
  const dataDir = await tempDir("skillloom-runtime-projection-");
  const env = {
    SKILLLOOM_HUB_BIND_HOST: "127.0.0.1",
    SKILLLOOM_HUB_PORT: String(port),
    SKILLLOOM_HUB_DATA_DIR: dataDir,
    SKILLLOOM_HUB_APP_CAP: appCapability
  };
  const first = await createHubRuntime(env);
  await first.start();
  let artifactId = "";
  try {
    const capture = await postJson(port, "/v1/brain/captures", {
      type: "note",
      title: "Runtime projected note",
      content: "Projection is refreshed by the runtime.",
      provenance: { source: "runtime-test" },
      sensitivity: "tailnet"
    }, authHeaders("alice@example.com", [{ roles: ["contributor"] }]));
    assert.equal(capture.status, 201);
    artifactId = (capture.body as { data: { artifact: { id: string } } }).data.artifact.id;
    assert.match(await readFile(join(dataDir, "brain", "projections", "obsidian", "human-knowledge", "note", `${artifactId}.md`), "utf8"), /Runtime projected note/u);
  } finally {
    await first.close();
  }
  const second = await createHubRuntime(env);
  try {
    assert.match(await readFile(join(dataDir, "brain", "projections", "obsidian", "human-knowledge", "note", `${artifactId}.md`), "utf8"), /Projection is refreshed by the runtime/u);
  } finally {
    await second.close();
  }
});

test("runtime starts and accepts canonical mutations when injected projection initialization fails", async () => {
  const port = await freePort();
  const dataDir = await tempDir("skillloom-runtime-failing-projection-");
  const projection = new FailingRuntimeProjection();
  const runtime = await createHubRuntime({
    SKILLLOOM_HUB_BIND_HOST: "127.0.0.1",
    SKILLLOOM_HUB_PORT: String(port),
    SKILLLOOM_HUB_DATA_DIR: dataDir,
    SKILLLOOM_HUB_APP_CAP: appCapability
  }, { projection });
  await runtime.start();
  try {
    assert.equal(projection.initialized, true);
    assert.equal(projection.dirty, true);
    const capture = await postJson(port, "/v1/brain/captures", {
      type: "note",
      title: "Projection failure does not block canonical write",
      content: "Canonical API remains available.",
      provenance: {},
      sensitivity: "private"
    }, authHeaders("alice@example.com", [{ roles: ["contributor"] }]));
    assert.equal(capture.status, 201);
    assert.equal(projection.dirty, true);
  } finally {
    await runtime.close();
  }
});

function fakeRequest(login: string | undefined, grants: readonly unknown[]) {
  return {
    headers: authHeaders(login, grants)
  } as Parameters<typeof authorizeTailscaleServeRequest>[0];
}

function authHeaders(login: string | undefined, grants: readonly unknown[]) {
  return {
    ...(login === undefined ? {} : { "tailscale-user-login": login }),
    "tailscale-app-capabilities": JSON.stringify({ [appCapability]: grants })
  };
}

function authorize(actorId: string, roles: readonly HubRole[]): HubAuthorizationContext {
  return createHubAuthorizationService({
    actorRoles: { [actorId]: roles },
    capabilityNamespaces: [appCapability]
  }).authorize({ actorId, kind: "user", appCapabilities: [] });
}

async function getJson(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number | undefined; body: unknown }> {
  return await new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function postJson(port: number, path: string, body: unknown, headers: Record<string, string>): Promise<{ status: number | undefined; body: unknown }> {
  return await new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
        "content-length": Buffer.byteLength(payload).toString()
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("No TCP port assigned"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for condition");
    await delay(10);
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
