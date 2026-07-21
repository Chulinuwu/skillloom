import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import type { HubHttpClient, TailscaleStatusProcess } from "../../src/hub/client/index.js";
import { HubTrustChangedError, HubUnavailableError } from "../../src/hub/client/index.js";
import { readHubEndpoint, readHubTrust } from "../../src/hub/config/index.js";
import { HUB_PROTOCOL_VERSION } from "../../src/hub/protocol/index.js";
import { UsageError } from "../../src/domain/errors.js";
import { HubSetupAdapter } from "../../src/setup/hub-adapter.js";
import { tempDir } from "../helpers/fixtures.js";

test("Hub setup preview is read-only until explicit trust", async () => {
  const root = await tempDir("skillloom-setup-hub-adapter-");
  const adapter = new HubSetupAdapter("0.2.1", tailscale(), factory(hello(publicKey())));

  const preview = await adapter.discover(root);
  assert.equal(preview.mode, "connected");
  assert.equal(await readHubTrust(root), null);
  assert.equal(await readHubEndpoint(root), null);
  if (preview.mode === "connected") await adapter.trust(root, preview);
  assert.equal((await readHubTrust(root))?.hubInstanceId, "hub-primary");
});

test("setup fails closed when an established Hub signing key changes", async () => {
  const root = await tempDir("skillloom-setup-hub-change-");
  const first = new HubSetupAdapter("0.2.1", tailscale(), factory(hello(publicKey())));
  const preview = await first.discover(root);
  if (preview.mode === "connected") await first.trust(root, preview);

  const changed = new HubSetupAdapter("0.2.1", tailscale(), factory(hello(publicKey())));
  await assert.rejects(() => changed.discover(root), HubTrustChangedError);
});

test("setup Brain read verification uses the real HTTP client with a valid bounded query", async () => {
  const root = await tempDir("skillloom-setup-hub-brain-");
  const key = publicKey();
  const requests: Array<{ method?: string; path?: string; body?: string }> = [];
  const adapter = new HubSetupAdapter("0.2.1", tailscale(), () => ({
    async request(request) {
      requests.push({ method: request.method, path: "path" in request ? request.path : undefined, body: "body" in request ? request.body : undefined });
      if ("path" in request && request.path === "/v1/hello") return request.parse(hello(key));
      if ("path" in request && request.path === "/v1/brain/search") {
        assert.equal(request.method, "POST");
        assert.deepEqual(JSON.parse(request.body ?? "{}"), { query: "skillloom-setup-read-probe", limit: 1 });
        return request.parse({ data: [] });
      }
      throw new Error(`unexpected request: ${"path" in request ? request.path : "mutation"}`);
    }
  }));
  const preview = await adapter.discover(root);
  if (preview.mode === "connected") await adapter.trust(root, preview);
  await adapter.verifyBrainRead(root);
  assert.deepEqual(requests.map((request) => request.path), ["/v1/hello", "/v1/hello", "/v1/brain/search"]);
});

test("setup Brain read verification propagates missing read authorization before installation", async () => {
  const root = await tempDir("skillloom-setup-hub-brain-denied-");
  const key = publicKey();
  const adapter = new HubSetupAdapter("0.2.1", tailscale(), () => ({
    async request(request) {
      if ("path" in request && request.path === "/v1/hello") return request.parse(hello(key));
      if ("path" in request && request.path === "/v1/brain/search") throw new Error("HUB_FORBIDDEN");
      throw new Error(`unexpected request: ${"path" in request ? request.path : "mutation"}`);
    }
  }));
  const preview = await adapter.discover(root);
  if (preview.mode === "connected") await adapter.trust(root, preview);
  await assert.rejects(() => adapter.verifyBrainRead(root), /HUB_FORBIDDEN/u);
});

test("strict initial reconcile fails closed while ordinary sync preserves its offline result", async () => {
  const root = await tempDir("skillloom-setup-hub-reconcile-offline-");
  const key = publicKey();
  let available = true;
  const adapter = new HubSetupAdapter("0.2.1", tailscale(), () => ({
    async request(request) {
      if (!available) throw new HubUnavailableError();
      return request.parse(hello(key));
    }
  }));
  const preview = await adapter.discover(root);
  if (preview.mode === "connected") await adapter.trust(root, preview);
  available = false;
  await assert.rejects(
    () => adapter.reconcile({ root, apply: true, strictInitial: true }),
    (error: unknown) => error instanceof UsageError && /--hub local/u.test(error.message)
  );
  assert.deepEqual(await adapter.reconcile({ root, apply: true }), {
    applied: false,
    pulled: 0,
    imported: 0,
    conflicts: ["Hub is offline"]
  });
});

function publicKey(): string {
  return generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
}

function hello(key: string) {
  return {
    protocolVersion: HUB_PROTOCOL_VERSION,
    minimumClientVersion: "0.2.0",
    hubInstanceId: "hub-primary",
    tailnetIdentity: { actorId: "user:owner@example.com", kind: "user" },
    grantedCapabilities: ["brain:read", "skill:read"],
    releaseSigningPublicKey: key,
    latestEventSequence: "7"
  };
}

function factory(value: unknown): (baseUrl: string) => HubHttpClient {
  return () => ({ request: async (request) => request.parse(value) });
}

function tailscale(): TailscaleStatusProcess {
  return {
    async run() {
      return { exitCode: 0, stdout: JSON.stringify({ MagicDNSSuffix: "tailnet.ts.net" }), stderr: "" };
    }
  };
}
