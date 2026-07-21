import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  HubTrustChangedError,
  HubTrustNotEstablishedError,
  openHubSession,
  previewHubSession,
  readTailscaleMagicDnsSuffix,
  setupHubSession,
  trustHubSession,
  type HubHttpClient,
  type TailscaleStatusProcess
} from "../../src/hub/client/index.js";
import { readHubEndpoint, readHubTrust } from "../../src/hub/config/index.js";
import { HUB_PROTOCOL_VERSION } from "../../src/hub/protocol/index.js";
import { tempDir } from "../helpers/fixtures.js";

function publicKey(): string {
  return generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
}

function status(stdout: string, exitCode = 0): TailscaleStatusProcess {
  return { run: async (executable, args) => {
    assert.equal(executable, "tailscale");
    assert.deepEqual(args, ["status", "--json"]);
    return { exitCode, stdout, stderr: "" };
  } };
}

function hello(key: string, hubInstanceId = "hub-primary") {
  return {
    protocolVersion: HUB_PROTOCOL_VERSION,
    minimumClientVersion: "0.2.0",
    hubInstanceId,
    tailnetIdentity: { actorId: "user:owner@example.com", kind: "user" },
    grantedCapabilities: ["brain:read", "skills:read"],
    releaseSigningPublicKey: key,
    latestEventSequence: "7"
  };
}

function factory(value: unknown, attempts: string[]): (baseUrl: string) => HubHttpClient {
  return (baseUrl) => ({ request: async (request) => {
    attempts.push(`${baseUrl}${"path" in request ? request.path : request.mutation.path}`);
    return request.parse(value);
  } });
}

test("extracts MagicDNSSuffix from an injected local tailscale status process", async () => {
  assert.equal(await readTailscaleMagicDnsSuffix(status(JSON.stringify({ MagicDNSSuffix: "Tailnet.TS.NET." }))), "tailnet.ts.net");
  await assert.rejects(() => readTailscaleMagicDnsSuffix(status("{}")), /MagicDNSSuffix/);
  await assert.rejects(() => readTailscaleMagicDnsSuffix(status("not-json")), /JSON/);
});

test("setup discovers, negotiates hello, and persists trust only with explicit consent", async () => {
  const root = await tempDir("skillloom-hub-setup-");
  const key = publicKey();
  const attempts: string[] = [];
  const session = await setupHubSession({
    root,
    clientVersion: "0.2.1",
    tailscaleStatus: status(JSON.stringify({ MagicDNSSuffix: "tailnet.ts.net" })),
    createClient: factory(hello(key), attempts),
    consent: { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
  });
  assert.equal(session.mode, "connected");
  assert.deepEqual(attempts, ["https://skillloom.tailnet.ts.net/v1/hello"]);
  assert.equal((await readHubEndpoint(root))?.url, "https://skillloom.tailnet.ts.net");
  assert.equal((await readHubTrust(root))?.hubInstanceId, "hub-primary");
});

test("setup can preview verified identity before explicit trust writes state", async () => {
  const root = await tempDir("skillloom-hub-preview-");
  const preview = await previewHubSession({
    root,
    clientVersion: "0.2.1",
    developmentUrl: "https://hub.example.test",
    createClient: factory(hello(publicKey()), [])
  });
  assert.equal(preview.negotiation.tailnetIdentity.actorId, "user:owner@example.com");
  assert.equal(await readHubTrust(root), null);
  assert.equal(await readHubEndpoint(root), null);
  await trustHubSession(root, preview, { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" });
  assert.equal((await readHubTrust(root))?.hubInstanceId, "hub-primary");
});

test("later sessions are verify-only and fail closed for absent or changed trust", async () => {
  const root = await tempDir("skillloom-hub-session-");
  const key = publicKey();
  const common = {
    root,
    clientVersion: "0.2.1",
    tailscaleStatus: status(JSON.stringify({ MagicDNSSuffix: "tailnet.ts.net" })),
    createClient: factory(hello(key), [])
  };
  await assert.rejects(() => openHubSession(common), HubTrustNotEstablishedError);
  await setupHubSession({ ...common, consent: { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" } });
  const opened = await openHubSession(common);
  assert.equal(opened.mode, "connected");
  await assert.rejects(() => openHubSession({ ...common, createClient: factory(hello(publicKey()), []) }), HubTrustChangedError);
  await assert.rejects(() => openHubSession({ ...common, createClient: factory(hello(key, "hub-replaced"), []) }), HubTrustChangedError);
});

test("verified sessions degrade locally when discovery is offline without changing cached trust", async () => {
  const root = await tempDir("skillloom-hub-offline-");
  const key = publicKey();
  const common = {
    root,
    clientVersion: "0.2.1",
    tailscaleStatus: status(JSON.stringify({ MagicDNSSuffix: "tailnet.ts.net" }))
  };
  await setupHubSession({
    ...common,
    createClient: factory(hello(key), []),
    consent: { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
  });
  const before = await readHubTrust(root);
  const result = await openHubSession({
    ...common,
    createClient: () => ({ request: async () => { throw new TypeError("offline"); } })
  });
  assert.equal(result.mode, "local-only");
  assert.deepEqual(await readHubTrust(root), before);
});
