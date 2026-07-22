import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { BrainApi, RegistryMutationApi, RegistryReadApi } from "../../src/hub/client/index.js";
import {
  createRegistryReadApi,
  createRegistryRemotePort,
  establishHubTrust,
  HubHttpError,
  HubStableReleaseNotFoundError,
  type HubHttpClient,
  type HubRequest,
  type RegistryRemotePort
} from "../../src/hub/client/index.js";
import { createHubAuthorizationService, type HubAuthorizationContext } from "../../src/hub/auth/index.js";
import { parseRegistryMcpPropose, parseRegistryMcpPublish } from "../../src/hub/mcp/schema.js";
import { parseRegistryMcpRead, parseRegistryMcpReleases } from "../../src/hub/mcp/registry-read-schema.js";
import {
  createPackageBlob,
  createRegistryHttpRouter,
  createRegistryService,
  generateEd25519RegistrySigner,
  hashPackageBlob,
  type Ed25519RegistrySigner,
  type PackageBlobV1,
  type RegistryPermissionPort
} from "../../src/hub/registry/index.js";
import { HubApiBridgeAdapter } from "../../src/setup/bridge-remote.js";
import { tempDir } from "../helpers/fixtures.js";

const hubInstanceId = "hub-primary";
const actorId = "user:reader@example.com";

test("reader tools use authorized Hub HTTP and expose only verified stable text", async () => {
  const fixture = await publishedRegistry();
  const router = createRegistryHttpRouter(fixture.service);
  const client = routerClient(router, authorization("reader"));
  const api = createRegistryReadApi({
    remote: createRegistryRemotePort(client),
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: fixture.signer.publicKey }
  });

  const listed = await api.listStableReleases(10);
  assert.equal(listed.channels.length, 1);
  assert.equal(listed.channels[0]?.channel, "stable");
  assert.equal(listed.channels[0]?.releases.length, 1);
  assert.equal(listed.channels[0]?.releases[0]?.releaseId, fixture.releaseId);

  const read = await api.readStableRelease(fixture.releaseId);
  assert.equal(read.release.channel, "stable");
  assert.equal(Object.hasOwn(read.release, "sourceCandidateId"), false);
  assert.equal(read.evidence.validationDigest, fixture.validationDigest);
  assert.deepEqual(read.files.map((file) => file.relativePath), ["SKILL.md", "references/evidence.md"]);
  assert.match(read.files[0]?.content ?? "", /Use this shared workflow safely/);

  const denied = createRegistryReadApi({
    remote: createRegistryRemotePort(routerClient(router, authorization())),
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: fixture.signer.publicKey }
  });
  await assert.rejects(denied.listStableReleases(), (error) =>
    error instanceof HubHttpError && error.status === 403);
});

test("reader tools fail closed on trust, signature, blob hash, and non-stable IDs", async () => {
  const fixture = await publishedRegistry();
  const baseRemote = fixtureRemote(fixture);
  let reads = 0;
  const countedRemote: RegistryRemotePort = {
    readStableManifest: async (afterSequence) => {
      reads += 1;
      return await baseRemote.readStableManifest(afterSequence);
    },
    readRelease: async (releaseId) => {
      reads += 1;
      return await baseRemote.readRelease(releaseId);
    },
    readBlob: async (packageHash) => {
      reads += 1;
      return await baseRemote.readBlob(packageHash);
    }
  };
  const wrongSigner = generateEd25519RegistrySigner();
  const changedTrust = createRegistryReadApi({
    remote: countedRemote,
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: wrongSigner.publicKey }
  });
  await assert.rejects(changedTrust.listStableReleases(), /changed|signing/i);
  assert.equal(reads, 0);

  const tamperedManifest: RegistryRemotePort = {
    ...baseRemote,
    readStableManifest: async () => ({
      ...fixture.published.manifest,
      payload: { ...fixture.published.manifest.payload, sequence: "999" }
    })
  };
  await assert.rejects(createRegistryReadApi({
    remote: tamperedManifest,
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: fixture.signer.publicKey }
  }).listStableReleases(), /signature/i);

  const changedBlob = skillBlob("Changed content");
  await assert.rejects(createRegistryReadApi({
    remote: { ...baseRemote, readBlob: async () => changedBlob },
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: fixture.signer.publicKey }
  }).readStableRelease(fixture.releaseId), /hash/i);

  const requested: string[] = [];
  const stableOnlyRemote: RegistryRemotePort = {
    ...baseRemote,
    readRelease: async (releaseId) => {
      requested.push(releaseId);
      return await baseRemote.readRelease(releaseId);
    }
  };
  await assert.rejects(createRegistryReadApi({
    remote: stableOnlyRemote,
    trust: trustedAnchor(fixture.signer),
    hub: { hubInstanceId, releaseSigningPublicKey: fixture.signer.publicKey }
  }).readStableRelease("release-unpromoted"), HubStableReleaseNotFoundError);
  assert.deepEqual(requested, []);
});

test("MCP reader schemas and bridge adapter stay strict and bounded", async () => {
  assert.deepEqual(parseRegistryMcpReleases({ limit: 25 }), { limit: 25 });
  assert.deepEqual(parseRegistryMcpRead({ releaseId: "release-1" }), { releaseId: "release-1" });
  assert.throws(() => parseRegistryMcpReleases({ limit: 101 }), /1 to 100/);
  assert.throws(() => parseRegistryMcpRead({ releaseId: "release-1", path: "/tmp/skill" }), /Unknown tool arguments/);
  assert.throws(() => parseRegistryMcpRead({ candidateId: "candidate-1" }), /Unknown tool arguments/);

  const calls: unknown[] = [];
  const registry: RegistryMutationApi & RegistryReadApi = {
    listStableReleases: async (limit) => {
      calls.push({ tool: "list", limit });
      return { channels: [{ channel: "stable", sequence: "1", releases: [] }] };
    },
    readStableRelease: async (releaseId) => {
      calls.push({ tool: "read", releaseId });
      throw new HubStableReleaseNotFoundError(releaseId);
    },
    propose: async () => { throw new Error("not called"); },
    publish: async () => { throw new Error("not called"); }
  };
  const adapter = new HubApiBridgeAdapter({ brain: unusedBrainApi(), registry });
  const listed = await adapter.call({ name: "skill_releases", arguments: { limit: 5 } });
  assert.deepEqual(listed.structuredContent, {
    channels: [{ channel: "stable", sequence: "1", releases: [] }]
  });
  await assert.rejects(adapter.call({ name: "skill_read", arguments: { releaseId: "release-2" } }), HubStableReleaseNotFoundError);
  assert.deepEqual(calls, [
    { tool: "list", limit: 5 },
    { tool: "read", releaseId: "release-2" }
  ]);
});
test("MCP skill mutation bridge preserves workflow proof and rejects malformed proof", async () => {
  const proof = workflowProof("candidate-mcp-1", `sha256-v2:${"b".repeat(64)}`);
  assert.deepEqual(parseRegistryMcpPropose({ ...mcpProposal(), workflowProof: proof }).workflowProof, proof);
  assert.deepEqual(parseRegistryMcpPublish({
    requestId: randomUUID(),
    candidateId: "candidate-mcp-1",
    version: "1.0.0",
    channel: "stable",
    workflowProof: proof
  }).workflowProof, proof);
  assert.throws(() => parseRegistryMcpPropose({ ...mcpProposal(), workflowProof: { ...proof, extra: true } }), /unexpected field extra/);
  const calls: unknown[] = [];
  const registry: RegistryMutationApi & RegistryReadApi = {
    listStableReleases: async () => { throw new Error("not called"); },
    readStableRelease: async () => { throw new Error("not called"); },
    propose: async (requestId, input) => {
      calls.push({ tool: "propose", requestId, workflowProof: input.workflowProof });
      return { candidate: {} as never, validation: {} as never };
    },
    publish: async (requestId, candidateId, version, workflowProof) => {
      calls.push({ tool: "publish", requestId, candidateId, version, workflowProof });
      return { release: {} as never, manifest: {} as never };
    }
  };
  const adapter = new HubApiBridgeAdapter({ brain: unusedBrainApi(), registry });
  const proposeId = randomUUID();
  const publishId = randomUUID();
  await adapter.call({ name: "skill_propose", arguments: { ...mcpProposal(), requestId: proposeId, workflowProof: proof } });
  await adapter.call({
    name: "skill_publish",
    arguments: { requestId: publishId, candidateId: "candidate-mcp-1", version: "1.0.0", channel: "stable", workflowProof: proof }
  });
  assert.deepEqual(calls, [
    { tool: "propose", requestId: proposeId, workflowProof: proof },
    { tool: "publish", requestId: publishId, candidateId: "candidate-mcp-1", version: "1.0.0", workflowProof: proof }
  ]);
});

function routerClient(
  router: ReturnType<typeof createRegistryHttpRouter>,
  authorizationContext: HubAuthorizationContext
): HubHttpClient {
  return {
    async request<T>(request: HubRequest<T>): Promise<T> {
      if (!("path" in request) || request.method !== "GET") throw new Error("Registry reader issued a non-read request");
      const response = await router.handle({
        method: request.method,
        url: request.path,
        headers: {}
      }, authorizationContext);
      if (response.status >= 400) throw new HubHttpError(response.status);
      return request.parse(response.body);
    }
  };
}

function authorization(role?: "reader"): HubAuthorizationContext {
  return createHubAuthorizationService({
    actorRoles: role ? { [actorId]: [role] } : {},
    capabilityNamespaces: ["skillloom.test/cap/skillloom"]
  }).authorize({ actorId, kind: "user", appCapabilities: [] });
}

function fixtureRemote(fixture: Awaited<ReturnType<typeof publishedRegistry>>): RegistryRemotePort {
  return {
    readStableManifest: async () => fixture.published.manifest,
    readRelease: async (releaseId) => {
      if (releaseId !== fixture.releaseId) throw new Error("Unexpected release read");
      return fixture.published.release;
    },
    readBlob: async (packageHash) => {
      if (packageHash !== fixture.published.release.payload.packageHash) throw new Error("Unexpected blob read");
      return fixture.blob;
    }
  };
}

async function publishedRegistry() {
  const signer = generateEd25519RegistrySigner();
  const blob = skillBlob();
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-mcp-read-"),
    hubInstanceId,
    signer,
    permissions: permissions(),
    clock: () => new Date("2026-07-21T02:00:00.000Z")
  });
  const proposal = await service.propose({
    actor: { actorId: "user:contributor@example.com" },
    requestId: randomUUID(),
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: await hashPackageBlob(blob),
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [{
      artifactId: "brain:decision-1",
      revision: "3",
      contentHash: `sha256:${"a".repeat(64)}`
    }]
  });
  const published = await service.publish({
    actor: { actorId: "user:promoter@example.com" },
    requestId: randomUUID(),
    candidateId: proposal.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable"
  });
  return {
    signer,
    service,
    blob,
    published,
    releaseId: published.release.payload.releaseId,
    validationDigest: published.release.payload.validationDigest
  };
}

function skillBlob(body = "Use this shared workflow safely."): PackageBlobV1 {
  return createPackageBlob([
    {
      relativePath: "SKILL.md",
      mode: 0o644,
      content: Buffer.from([
        "---",
        "name: shared-skill",
        "description: Shared workflow.",
        "capabilities: [filesystem-read]",
        "---",
        "",
        body
      ].join("\n"))
    },
    {
      relativePath: "references/evidence.md",
      mode: 0o644,
      content: Buffer.from("Validated from a signed stable release.\n")
    }
  ]);
}

function trustedAnchor(signer: Ed25519RegistrySigner) {
  return establishHubTrust(
    { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
  );
}

function permissions(): RegistryPermissionPort {
  return {
    async requirePropose() {},
    async requirePublish() {}
  };
}

function unusedBrainApi(): BrainApi {
  const unused = async (): Promise<never> => { throw new Error("Brain API was not called"); };
  return {
    search: unused,
    retrieve: unused,
    health: unused,
    read: unused,
    capture: unused,
    update: unused,
    link: unused
  };
}
function mcpProposal() {
  return {
    requestId: randomUUID(),
    name: "shared-skill",
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [],
    files: [{ relativePath: "SKILL.md", mode: 0o644, content: "safe" }]
  };
}
function workflowProof(candidateId: string, packageHash: string) {
  return {
    schemaVersion: "skillloom-workflow-proof-v1" as const,
    decisionId: "proof-mcp-1",
    idempotencyKey: "proof-mcp-request-1",
    verdict: "passed" as const,
    workflow: {
      artifactId: "workflow-mcp-1",
      revision: "1",
      contentHash: `sha256:${"a".repeat(64)}`
    },
    candidate: { candidateId, packageHash },
    verifier: {
      kind: "held-out-evaluation" as const,
      summary: "MCP workflow evaluation passed",
      evidence: "MCP bridge preserved the proof"
    },
    provenanceHashes: [],
    decidedAt: "2026-07-21T00:00:00.000Z"
  };
}
