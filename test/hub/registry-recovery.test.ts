import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createPackageBlob, generateEd25519RegistrySigner, hashPackageBlob } from "../../src/hub/registry/index.js";
import {
  createRegistryService,
  registryLayout,
  type RegistryActor,
  type RegistryFaultPoint,
  type RegistryPermissionPort
} from "../../src/hub/registry/server-index.js";
import { tempDir } from "../helpers/fixtures.js";

const contributor: RegistryActor = { actorId: "node:contributor" };
const promoter: RegistryActor = { actorId: "node:promoter" };
const permissions: RegistryPermissionPort = {
  async requirePropose() {},
  async requirePublish() {}
};

function skillBlob() {
  return createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from("---\nname: durable-skill\ndescription: Durable workflow.\n---\n\nUse safely.\n")
  }]);
}

for (const point of ["afterIntent", "afterBlob", "afterCandidate"] satisfies RegistryFaultPoint[]) {
  test(`recovers interrupted proposal at ${point}`, async () => {
    const root = await tempDir(`skillloom-registry-propose-${point}-`);
    const signer = generateEd25519RegistrySigner();
    const blob = skillBlob();
    const input = {
      actor: contributor,
      requestId: randomUUID(),
      name: "durable-skill",
      packageBlob: blob,
      claimedPackageHash: await hashPackageBlob(blob),
      baseReleaseHash: null,
      capabilities: [],
      provenance: []
    } as const;
    let failed = false;
    const interrupted = await createRegistryService({ root, hubInstanceId: "hub-primary", signer, permissions, faultInjector(current) {
      if (!failed && current === point) {
        failed = true;
        throw new Error(`fault:${point}`);
      }
    } });
    await assert.rejects(() => interrupted.propose(input), new RegExp(`fault:${point}`));
    const recovered = await createRegistryService({ root, hubInstanceId: "hub-primary", signer, permissions });
    const replay = await recovered.propose(input);
    assert.equal(replay.candidate.payload.packageHash, input.claimedPackageHash);
    assert.deepEqual(await recovered.readBlob(input.claimedPackageHash), blob);
  });
}

for (const point of ["afterIntent", "afterRelease", "afterManifest", "afterIdempotency"] satisfies RegistryFaultPoint[]) {
  test(`recovers interrupted publish at ${point} without an orphan reference`, async () => {
    const root = await tempDir(`skillloom-registry-publish-${point}-`);
    const signer = generateEd25519RegistrySigner();
    const initial = await createRegistryService({ root, hubInstanceId: "hub-primary", signer, permissions });
    const blob = skillBlob();
    const proposal = await initial.propose({
      actor: contributor,
      requestId: randomUUID(),
      name: "durable-skill",
      packageBlob: blob,
      claimedPackageHash: await hashPackageBlob(blob),
      baseReleaseHash: null,
      capabilities: [],
      provenance: []
    });
    const input = {
      actor: promoter,
      requestId: randomUUID(),
      candidateId: proposal.candidate.payload.candidateId,
      version: "1.0.0",
      channel: "stable"
    } as const;
    let failed = false;
    const interrupted = await createRegistryService({ root, hubInstanceId: "hub-primary", signer, permissions, faultInjector(current) {
      if (!failed && current === point) {
        failed = true;
        throw new Error(`fault:${point}`);
      }
    } });
    await assert.rejects(() => interrupted.publish(input), new RegExp(`fault:${point}`));
    const recovered = await createRegistryService({ root, hubInstanceId: "hub-primary", signer, permissions });
    const replay = await recovered.publish(input);
    const manifest = await recovered.readManifest("stable");
    assert.equal(manifest?.payload.releases[0]?.releaseId, replay.release.payload.releaseId);
    for (const release of manifest?.payload.releases ?? []) {
      await access(registryLayout(root).blob(release.packageHash));
      assert.ok(await recovered.readBlob(release.packageHash));
    }
  });
}
