import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPackageBlob, generateEd25519RegistrySigner, hashPackageBlob } from "../../src/hub/registry/index.js";
import { registryLayout } from "../../src/hub/registry/registry-layout.js";
import { deterministicRegistryId } from "../../src/hub/registry/server-hash.js";
import {
  RegistryAuthorizationError,
  RegistryDivergenceError,
  RegistryIdempotencyConflictError,
  RegistryPublishBlockedError,
  createRegistryService,
  type RegistryActor,
  type RegistryPermissionPort
} from "../../src/hub/registry/server-index.js";
import type { WorkflowProofDecision } from "../../src/policy/workflow-proof.js";
import { tempDir } from "../helpers/fixtures.js";

const contributor: RegistryActor = { actorId: "user:contributor@example.com" };
const promoter: RegistryActor = { actorId: "user:promoter@example.com" };

function permissions(allowed: ReadonlySet<string> = new Set([contributor.actorId, promoter.actorId])): RegistryPermissionPort {
  return {
    async requirePropose(actor) {
      if (!allowed.has(actor.actorId)) throw new RegistryAuthorizationError("propose denied");
    },
    async requirePublish(actor) {
      if (actor.actorId !== promoter.actorId || !allowed.has(actor.actorId)) throw new RegistryAuthorizationError("publish denied");
    }
  };
}

function skillBlob(body = "Use this shared workflow safely.\n", capabilities = "filesystem-read") {
  return createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from([
      "---",
      "name: shared-skill",
      "description: A shared workflow.",
      `capabilities: [${capabilities}]`,
      "---",
      "",
      body
    ].join("\n"))
  }]);
}

function proofDecision(
  candidateId: string,
  packageHash: string,
  workflow: { artifactId: string; revision: string; contentHash: string }
): WorkflowProofDecision {
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: "proof-registry",
    idempotencyKey: "registry-proof-op",
    verdict: "passed",
    workflow,
    candidate: { candidateId, packageHash },
    verifier: { kind: "replay", summary: "passed", evidence: "node --test registry-proof.test.ts" },
    provenanceHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    decidedAt: "2026-07-21T00:00:00.000Z"
  };
}

async function proposeInput(blob = skillBlob(), baseReleaseHash: string | null = null) {
  return {
    actor: contributor,
    requestId: randomUUID(),
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: await hashPackageBlob(blob),
    baseReleaseHash,
    capabilities: ["filesystem-read"] as const,
    provenance: []
  };
}

test("server validates, persists, signs and publishes immutable registry content", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-service-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions(),
    clock: () => new Date("2026-07-21T01:00:00.000Z")
  });
  const proposal = await service.propose(await proposeInput());
  assert.equal(proposal.candidate.payload.divergence.state, "aligned");
  assert.equal(proposal.validation.metadata.name, "shared-skill");
  assert.deepEqual(proposal.validation.capabilities, ["filesystem-read"]);
  const published = await service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: proposal.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable"
  });
  assert.equal(published.release.payload.packageHash, proposal.candidate.payload.packageHash);
  assert.equal(published.manifest.payload.releases[0]?.releaseId, published.release.payload.releaseId);
  assert.deepEqual(await service.readBlob(published.release.payload.packageHash), skillBlob());
});

test("workflow proof persists on registry candidate and publish cannot bypass or tamper it", async () => {
  const root = await tempDir("skillloom-registry-workflow-proof-");
  const service = await createRegistryService({
    root,
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions(),
    clock: () => new Date("2026-07-21T01:00:00.000Z")
  });
  const requestId = randomUUID();
  const blob = skillBlob();
  const packageHash = await hashPackageBlob(blob);
  const candidateId = deterministicRegistryId("candidate", contributor.actorId, requestId);
  const workflow = {
    artifactId: "brain-workflow",
    revision: "1",
    contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  };
  const workflowProof = proofDecision(candidateId, packageHash, workflow);
  const proposal = await service.propose({
    actor: contributor,
    requestId,
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: packageHash,
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [workflow],
    workflowProof
  });
  assert.deepEqual(proposal.candidate.payload.governedWorkflowProof, workflowProof);
  await assert.rejects(() => service.propose({
    actor: contributor,
    requestId,
    name: "shared-skill",
    packageBlob: blob,
    claimedPackageHash: packageHash,
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [workflow],
    workflowProof: { ...workflowProof, verifier: { ...workflowProof.verifier, evidence: "changed proof" } }
  }), RegistryIdempotencyConflictError);
  await assert.rejects(() => service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof: { ...workflowProof, candidate: { ...workflowProof.candidate, candidateId: "other-candidate" } }
  }), RegistryPublishBlockedError);
  const publishRequestId = randomUUID();
  const published = await service.publish({
    actor: promoter,
    requestId: publishRequestId,
    candidateId,
    version: "1.0.0",
    channel: "stable"
  });
  assert.equal(published.release.payload.sourceCandidateId, candidateId);
  await assert.rejects(() => service.publish({
    actor: promoter,
    requestId: publishRequestId,
    candidateId,
    version: "1.0.0",
    channel: "stable",
    workflowProof
  }), RegistryIdempotencyConflictError);
  const manifestBefore = await service.readManifest("stable");
  const nextRequestId = randomUUID();
  const nextBlob = skillBlob("Use this updated workflow safely.\n");
  const nextPackageHash = await hashPackageBlob(nextBlob);
  const nextCandidateId = deterministicRegistryId("candidate", contributor.actorId, nextRequestId);
  const nextProof = proofDecision(nextCandidateId, nextPackageHash, workflow);
  await service.propose({
    actor: contributor,
    requestId: nextRequestId,
    name: "shared-skill",
    packageBlob: nextBlob,
    claimedPackageHash: nextPackageHash,
    baseReleaseHash: published.release.payload.packageHash,
    capabilities: ["filesystem-read"],
    provenance: [workflow],
    workflowProof: nextProof
  });
  const candidatePath = join(registryLayout(root).candidates, `${nextCandidateId}.json`);
  const stored = JSON.parse(await readFile(candidatePath, "utf8"));
  stored.candidate.payload.governedWorkflowProof.verdict = "failed";
  await writeFile(candidatePath, JSON.stringify(stored, null, 2));
  await assert.rejects(() => service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: nextCandidateId,
    version: "1.0.1",
    channel: "stable",
    workflowProof: nextProof
  }), RegistryPublishBlockedError);
  assert.deepEqual(await service.readManifest("stable"), manifestBefore);
});

test("idempotency is scoped to actor and UUID and rejects changed reuse", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-idempotency-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions()
  });
  const input = await proposeInput();
  const first = await service.propose(input);
  const replay = await service.propose(input);
  assert.deepEqual(replay, first);
  await assert.rejects(
    () => service.propose({ ...input, name: "different-skill" }),
    RegistryIdempotencyConflictError
  );
});

test("server rejects client hash and capability claims that differ from revalidation", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-claims-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions()
  });
  const input = await proposeInput();
  await assert.rejects(() => service.propose({ ...input, claimedPackageHash: `sha256-v2:${"0".repeat(64)}` }), /hash/i);
  await assert.rejects(() => service.propose({ ...input, requestId: randomUUID(), capabilities: [] }), /capabilit/i);
});

test("danger findings persist as evidence but block publish", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-danger-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions()
  });
  const input = await proposeInput(skillBlob("Never run rm -rf ./cache.\n"));
  const proposal = await service.propose(input);
  assert.ok(proposal.validation.findings.some((finding) => finding.severity === "danger"));
  await assert.rejects(() => service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: proposal.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable"
  }), RegistryPublishBlockedError);
  assert.equal((await service.getCandidate(proposal.candidate.payload.candidateId)).validation.findings.length > 0, true);
});

test("base mismatch records divergence without moving the stable channel", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-divergence-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions()
  });
  const first = await service.propose(await proposeInput());
  const published = await service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: first.candidate.payload.candidateId,
    version: "1.0.0",
    channel: "stable"
  });
  const divergent = await service.propose(await proposeInput(skillBlob("A competing workflow.\n"), `sha256-v2:${"f".repeat(64)}`));
  assert.deepEqual(divergent.candidate.payload.divergence, {
    state: "divergent",
    currentReleaseHash: published.release.payload.packageHash
  });
  await assert.rejects(() => service.publish({
    actor: promoter,
    requestId: randomUUID(),
    candidateId: divergent.candidate.payload.candidateId,
    version: "1.1.0",
    channel: "stable"
  }), RegistryDivergenceError);
  assert.equal((await service.readManifest("stable"))?.payload.releases[0]?.packageHash, published.release.payload.packageHash);
});

test("concrete propose and publish permissions are required", async () => {
  const service = await createRegistryService({
    root: await tempDir("skillloom-registry-auth-"),
    hubInstanceId: "hub-primary",
    signer: generateEd25519RegistrySigner(),
    permissions: permissions(new Set())
  });
  await assert.rejects(async () => await service.propose(await proposeInput()), RegistryAuthorizationError);
});
