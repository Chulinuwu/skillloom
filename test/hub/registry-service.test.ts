import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createPackageBlob, generateEd25519RegistrySigner, hashPackageBlob } from "../../src/hub/registry/index.js";
import {
  RegistryAuthorizationError,
  RegistryDivergenceError,
  RegistryIdempotencyConflictError,
  RegistryPublishBlockedError,
  createRegistryService,
  type RegistryActor,
  type RegistryPermissionPort
} from "../../src/hub/registry/server-index.js";
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
