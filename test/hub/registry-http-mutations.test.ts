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
import { deterministicRegistryId } from "../../src/hub/registry/server-hash.js";
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
test("HTTP registry workflow proof persists through public propose and publish contracts", async () => {
  const service = await registry();
  const router = createRegistryHttpRouter(service);
  const authorization = auth(["contributor", "promoter"]);
  const proposeId = randomUUID();
  const body = proposalBody();
  const packageHash = await packageHashFor(body);
  const candidateId = deterministicRegistryId("candidate", actorId, proposeId);
  const proof = workflowProof(candidateId, packageHash);
  const proposed = await router.handle(jsonRequest("POST", "/v1/registry/proposals", proposeId, { ...body, workflowProof: proof }), authorization);
  assert.equal(proposed.status, 201);
  assert.deepEqual((proposed.body as { data: { candidate: { payload: { governedWorkflowProof: unknown } } } }).data.candidate.payload.governedWorkflowProof, proof);
  const publishId = randomUUID();
  const published = await router.handle(jsonRequest("POST", "/v1/registry/releases", publishId, {
    candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof: proof
  }), authorization);
  assert.equal(published.status, 201);
  const replay = await router.handle(jsonRequest("POST", "/v1/registry/releases", publishId, {
    candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof: proof
  }), authorization);
  assert.deepEqual(replay.body, published.body);
  const conflict = await router.handle(jsonRequest("POST", "/v1/registry/releases", publishId, {
    candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof: { ...proof, decisionId: "proof-other" }
  }), authorization);
  assert.equal(conflict.status, 400);
});
test("HTTP registry rejects malformed workflow proof fields before mutation", async () => {
  const service = await registry();
  const router = createRegistryHttpRouter(service);
  const response = await router.handle(jsonRequest("POST", "/v1/registry/proposals", randomUUID(), {
    ...proposalBody(),
    workflowProof: { schemaVersion: "skillloom-workflow-proof-v1", extra: true }
  }), auth(["contributor"]));
  assert.equal(response.status, 400);
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
  const proof = workflowProof(proposal.candidate.payload.candidateId, proposal.candidate.payload.packageHash);
  const published = await service.publish({
    actor: { actorId },
    requestId: randomUUID(),
    candidateId: proposal.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof: proof
  });
  const requests: unknown[] = [];
  const client: HubHttpClient = {
    request: async (request) => {
      requests.push(request);
      if (!("mutation" in request)) throw new Error("expected mutation");
      return request.parse({
        requestId: request.mutation.requestId,
        accepted: true,
        data: request.mutation.path === "/v1/registry/releases" ? published : proposal
      });
    }
  };
  const root = await tempDir("skillloom-registry-client-mutation-");
  const api = createRegistryMutationApi(root, client);
  const result = await api.propose(randomUUID(), { ...proposalBody(), workflowProof: proof });
  await api.publish(randomUUID(), proposal.candidate.payload.candidateId, "1.0.0", proof);
  assert.equal(result.candidate.payload.candidateId, proposal.candidate.payload.candidateId);
  assert.equal((requests[0] as { mutation: { method: string; path: string } }).mutation.method, "POST");
  assert.equal((requests[0] as { mutation: { path: string } }).mutation.path, "/v1/registry/proposals");
  assert.deepEqual(JSON.parse((requests[0] as { mutation: { body: string } }).mutation.body).workflowProof, proof);
  assert.deepEqual(JSON.parse((requests[1] as { mutation: { body: string } }).mutation.body).workflowProof, proof);
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
async function packageHashFor(body: ReturnType<typeof proposalBody>): Promise<string> {
  return await hashPackageBlob(createPackageBlob(body.files.map((file) => ({
    relativePath: file.relativePath,
    mode: file.mode,
    content: Buffer.from(file.content)
  }))));
}
function workflowProof(candidateId: string, packageHash: string) {
  return {
    schemaVersion: "skillloom-workflow-proof-v1" as const,
    decisionId: "proof-1",
    idempotencyKey: "proof-request-1",
    verdict: "passed" as const,
    workflow: {
      artifactId: "workflow-http-1",
      revision: "1",
      contentHash: `sha256:${"a".repeat(64)}`
    },
    candidate: { candidateId, packageHash },
    verifier: {
      kind: "replay" as const,
      summary: "Public registry workflow replay passed",
      evidence: "node --test public registry path"
    },
    provenanceHashes: [],
    decidedAt: "2026-07-21T00:00:00.000Z"
  };
}
