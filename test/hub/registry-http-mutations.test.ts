import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createHubAuthorizationService } from "../../src/hub/auth/index.js";
import { createRegistryMutationApi, type HubHttpClient } from "../../src/hub/client/index.js";
import {
  createPackageBlob,
  createRegistryHttpRouter,
  createRegistryService,
  generateEd25519RegistrySigner,
  hashPackageBlob,
  type RegistryPermissionPort
} from "../../src/hub/registry/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actorId = "user:promoter@example.com";

test("HTTP propose and publish use authorization actor and expose stable manifest", async () => {
  const service = await registry();
  const router = createRegistryHttpRouter(service);
  const authorization = auth(["promoter"]);
  const proposeId = randomUUID();
  const proposed = await router.handle(jsonRequest("POST", "/v1/registry/proposals", proposeId, proposalBody()), authorization);
  assert.equal(proposed.status, 201);
  assert.equal((proposed.body as { requestId: string }).requestId, proposeId);
  const candidateId = (((proposed.body as { data: { candidate: { payload: { candidateId: string; createdBy: string } } } }).data).candidate).payload.candidateId;
  assert.equal((((proposed.body as { data: { candidate: { payload: { createdBy: string } } } }).data).candidate).payload.createdBy, actorId);
  const publishId = randomUUID();
  const published = await router.handle(jsonRequest("POST", "/v1/registry/releases", publishId, {
    candidateId,
    version: "1.0.0",
    channel: "stable"
  }), authorization);
  assert.equal(published.status, 201);
  const manifest = await router.handle({ method: "GET", url: "/v1/registry/channels/stable?afterSequence=0", headers: {} }, authorization);
  assert.equal(manifest.status, 200);
  assert.equal((((manifest.body as { data: { payload: { releases: Array<{ name: string }> } } }).data).payload).releases[0]?.name, "shared-skill");
});

test("HTTP registry mutations deny readers and reject idempotency reuse conflicts", async () => {
  const service = await registry();
  const router = createRegistryHttpRouter(service);
  const requestId = randomUUID();
  const denied = await router.handle(jsonRequest("POST", "/v1/registry/proposals", requestId, proposalBody()), auth(["reader"]));
  assert.equal(denied.status, 403);
  const first = await router.handle(jsonRequest("POST", "/v1/registry/proposals", requestId, proposalBody()), auth(["contributor"]));
  const replay = await router.handle(jsonRequest("POST", "/v1/registry/proposals", requestId, proposalBody()), auth(["contributor"]));
  const conflict = await router.handle(jsonRequest("POST", "/v1/registry/proposals", requestId, { ...proposalBody(), name: "other-skill" }), auth(["contributor"]));
  assert.equal(first.status, 201);
  assert.deepEqual(replay.body, first.body);
  assert.equal(conflict.status, 400);
});

test("HTTP registry revalidates package paths and blocks unsafe packages", async () => {
  const service = await registry();
  const router = createRegistryHttpRouter(service);
  const unsafe = await router.handle(jsonRequest("POST", "/v1/registry/proposals", randomUUID(), {
    ...proposalBody(),
    files: [{ relativePath: "../SKILL.md", mode: 0o644, content: "bad" }]
  }), auth(["contributor"]));
  assert.equal(unsafe.status, 400);
});

test("client registry mutation API sends durable POSTs and parses signed acknowledgements", async () => {
  const service = await registry();
  const blob = createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from(proposalBody().files[0]?.content ?? "")
  }]);
  const proposal = await service.propose({
    actor: { actorId },
    requestId: randomUUID(),
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: await hashPackageBlob(blob),
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: []
  });
  const requests: unknown[] = [];
  const client: HubHttpClient = {
    request: async (request) => {
      requests.push(request);
      if (!("mutation" in request)) throw new Error("expected mutation");
      return request.parse({ requestId: request.mutation.requestId, accepted: true, data: proposal });
    }
  };
  const root = await tempDir("skillloom-registry-client-mutation-");
  const result = await createRegistryMutationApi(root, client).propose(randomUUID(), proposalBody());
  assert.equal(result.candidate.payload.candidateId, proposal.candidate.payload.candidateId);
  assert.equal((requests[0] as { mutation: { method: string; path: string } }).mutation.method, "POST");
  assert.equal((requests[0] as { mutation: { path: string } }).mutation.path, "/v1/registry/proposals");
});

async function registry() {
  return await createRegistryService({
    root: await tempDir("skillloom-registry-http-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions()
  });
}

function permissions(): RegistryPermissionPort {
  return {
    async requirePropose() {},
    async requirePublish() {}
  };
}

function auth(roles: readonly string[]) {
  return createHubAuthorizationService({ actorRoles: { [actorId]: roles }, capabilityNamespaces: ["skillloom.test/cap/skillloom"] }).authorize({
    actorId,
    kind: "user",
    appCapabilities: []
  });
}

function jsonRequest(method: "POST", url: string, requestId: string, body: unknown) {
  return {
    method,
    url,
    headers: { "content-type": "application/json", "idempotency-key": requestId },
    body: new TextEncoder().encode(JSON.stringify(body))
  };
}

function proposalBody() {
  return {
    name: "shared-skill",
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [],
    files: [{
      relativePath: "SKILL.md",
      mode: 0o644,
      content: [
        "---",
        "name: shared-skill",
        "description: A shared workflow.",
        "capabilities: [filesystem-read]",
        "---",
        "",
        "Use this shared workflow safely."
      ].join("\n")
    }]
  };
}
