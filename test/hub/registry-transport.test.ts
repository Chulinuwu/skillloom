import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createHubAuthorizationService, type HubAuthorizationContext } from "../../src/hub/auth/index.js";
import {
  createRegistryRemotePort,
  type HubHttpClient,
  type HubRequest
} from "../../src/hub/client/index.js";
import {
  createPackageBlob,
  generateEd25519RegistrySigner,
  hashPackageBlob,
  type PackageBlobV1
} from "../../src/hub/registry/index.js";
import {
  createRegistryHttpRouter,
  createRegistryService,
  type RegistryActor,
  type RegistryPermissionPort
} from "../../src/hub/registry/server-index.js";
import { tempDir } from "../helpers/fixtures.js";

const contributor: RegistryActor = { actorId: "user:contributor@example.com" };
const promoter: RegistryActor = { actorId: "user:promoter@example.com" };

test("registry HTTP router serves cursor-aware stable manifests, releases, and blobs", async () => {
  const fixture = await publishedRegistry();
  const router = createRegistryHttpRouter(fixture.service);
  const auth = authorization("reader");
  const manifest = await router.handle({ method: "GET", url: "/v1/registry/channels/stable?afterSequence=0" }, auth);
  assert.equal(manifest.status, 200);
  assert.deepEqual(manifest.body, { data: fixture.published.manifest });
  const unchanged = await router.handle({
    method: "GET",
    url: `/v1/registry/channels/stable?afterSequence=${fixture.published.manifest.payload.sequence}`
  }, auth);
  assert.deepEqual(unchanged.body, { data: null });
  const release = await router.handle({
    method: "GET",
    url: `/v1/registry/releases/${fixture.published.release.payload.releaseId}`
  }, auth);
  assert.deepEqual(release.body, { data: fixture.published.release });
  const blob = await router.handle({
    method: "GET",
    url: `/v1/registry/blobs/${fixture.published.release.payload.packageHash}`
  }, auth);
  assert.deepEqual(blob.body, { data: fixture.blob });
});

test("registry HTTP router fail-closes invalid methods, paths, and unauthorized reads", async () => {
  const fixture = await publishedRegistry();
  const router = createRegistryHttpRouter(fixture.service);
  const wrongMethod = await router.handle({ method: "POST", url: "/v1/registry/channels/stable" }, authorization("reader"));
  assert.equal(wrongMethod.status, 404);
  const malformed = await router.handle({ method: "GET", url: "/v1/registry/channels/stable?afterSequence=01" }, authorization("reader"));
  assert.equal(malformed.status, 400);
  const forbidden = await router.handle({ method: "GET", url: "/v1/registry/channels/stable" }, authorization());
  assert.equal(forbidden.status, 403);
});

test("registry remote uses canonical read routes and validates response envelopes", async () => {
  const fixture = await publishedRegistry();
  const responses: Readonly<Record<string, unknown>> = {
    "/v1/registry/channels/stable?afterSequence=0": { data: fixture.published.manifest },
    [`/v1/registry/releases/${fixture.published.release.payload.releaseId}`]: { data: fixture.published.release },
    [`/v1/registry/blobs/${encodeURIComponent(fixture.published.release.payload.packageHash)}`]: { data: fixture.blob }
  };
  const paths: string[] = [];
  const client: HubHttpClient = {
    async request<T>(request: HubRequest<T>): Promise<T> {
      assert.ok("path" in request);
      paths.push(request.path);
      return request.parse(responses[request.path]);
    }
  };
  const remote = createRegistryRemotePort(client);
  assert.deepEqual(await remote.readStableManifest("0"), fixture.published.manifest);
  assert.deepEqual(await remote.readRelease(fixture.published.release.payload.releaseId), fixture.published.release);
  assert.deepEqual(await remote.readBlob(fixture.published.release.payload.packageHash), fixture.blob);
  assert.deepEqual(paths, Object.keys(responses));
});

function authorization(role?: "reader"): HubAuthorizationContext {
  const actorId = "user:reader@example.com";
  return createHubAuthorizationService({
    actorRoles: role ? { [actorId]: [role] } : {},
    capabilityNamespaces: ["example.com/cap/skillloom"]
  }).authorize({ actorId, kind: "user", appCapabilities: [] });
}

function permissions(): RegistryPermissionPort {
  return {
    async requirePropose(actor) {
      assert.equal(actor.actorId, contributor.actorId);
    },
    async requirePublish(actor) {
      assert.equal(actor.actorId, promoter.actorId);
    }
  };
}

async function publishedRegistry() {
  const blob = skillBlob();
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-transport-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions(),
    clock: () => new Date("2026-07-21T01:00:00.000Z")
  });
  const proposal = await service.propose({
    actor: contributor,
    requestId: randomUUID(),
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: await hashPackageBlob(blob),
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: []
  });
  const published = await service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: proposal.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable"
  });
  return { blob, service, published };
}

function skillBlob(): PackageBlobV1 {
  return createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from("---\nname: shared-skill\ndescription: Shared workflow.\ncapabilities: [filesystem-read]\n---\n\nUse this shared workflow safely.\n")
  }]);
}
