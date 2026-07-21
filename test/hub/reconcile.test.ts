import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  HubUnavailableError,
  reconcileHubReleases,
  type RegistryRemotePort
} from "../../src/hub/client/index.js";
import { establishHubTrust } from "../../src/hub/client/trust.js";
import { readHubSyncState, writeHubSyncState } from "../../src/hub/config/index.js";
import {
  createPackageBlob,
  generateEd25519RegistrySigner,
  hashPackageBlob,
  parseChannelManifest,
  parseRegistryRelease,
  signRegistryPayload,
  type ChannelManifest,
  type Ed25519RegistrySigner,
  type PackageBlobV1,
  type RegistryRelease,
  type SignedRegistryPayload
} from "../../src/hub/registry/index.js";
import { listCandidates } from "../../src/store/candidates.js";
import { tempDir } from "../helpers/fixtures.js";

const hubInstanceId = "hub-primary";

type Fixture = {
  blob: PackageBlobV1;
  release: SignedRegistryPayload<RegistryRelease>;
  manifest: SignedRegistryPayload<ChannelManifest>;
};

test("two isolated roots reconcile the same verified stable release through an explicit local apply port", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer);
  const roots = [await tempDir("skillloom-reconcile-a-"), await tempDir("skillloom-reconcile-b-")];
  const applied: Array<{ root: string; releaseId: string }> = [];
  const results = await Promise.all(roots.map((root) => reconcileHubReleases({
    root,
    remote: remote(fixture),
    trust: trust(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    apply: { applyStableRelease: async (input) => { applied.push({ root: input.root, releaseId: input.release.release.releaseId }); } }
  })));
  assert.deepEqual(results.map((item) => item.mode), ["reconciled", "reconciled"]);
  assert.deepEqual(results.map((item) => item.sequence), ["9", "9"]);
  assert.equal(applied.length, 2);
  for (const root of roots) {
    assert.equal((await readHubSyncState(root)).lastEventSequence, "9");
    assert.equal((await listCandidates(root))[0]?.packageHash, fixture.release.payload.packageHash);
  }
});

test("cursor advances only after all durable local effects complete", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer);
  const root = await tempDir("skillloom-reconcile-checkpoint-");
  await writeHubSyncState(root, { version: 1, lastEventSequence: "4" });
  await assert.rejects(() => reconcileHubReleases({
    root,
    remote: remote(fixture),
    trust: trust(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    apply: { applyStableRelease: async () => { throw new Error("local apply interrupted"); } }
  }), /interrupted/);
  assert.equal((await readHubSyncState(root)).lastEventSequence, "4");
  assert.equal((await listCandidates(root)).length, 1);
});

test("offline reconcile leaves cursor, candidates, and installed skill roots untouched", async () => {
  const signer = generateEd25519RegistrySigner();
  const root = await tempDir("skillloom-reconcile-offline-");
  await writeHubSyncState(root, { version: 1, lastEventSequence: "3" });
  const result = await reconcileHubReleases({
    root,
    remote: {
      readStableManifest: async () => { throw new HubUnavailableError(); },
      readRelease: async () => { throw new Error("unreachable"); },
      readBlob: async () => { throw new Error("unreachable"); }
    },
    trust: trust(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"]
  });
  assert.equal(result.mode, "offline");
  assert.equal((await readHubSyncState(root)).lastEventSequence, "3");
  assert.deepEqual(await listCandidates(root), []);
  await assert.rejects(access(join(root, ".claude", "skills")));
});

test("review and quarantine data cannot enter reconciliation because the remote port exposes stable manifests only", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer);
  const root = await tempDir("skillloom-reconcile-stable-only-");
  const seen: string[] = [];
  const source = remote(fixture);
  await reconcileHubReleases({
    root,
    remote: {
      ...source,
      readStableManifest: async (afterSequence) => { seen.push(afterSequence); return await source.readStableManifest(afterSequence); }
    },
    trust: trust(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"]
  });
  assert.deepEqual(seen, ["0"]);
  assert.equal((await readHubSyncState(root)).lastEventSequence, "9");
});

test("rejects a signed non-stable manifest before any local effect", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer, "review");
  const root = await tempDir("skillloom-reconcile-review-");
  await assert.rejects(() => reconcileHubReleases({
    root,
    remote: remote(fixture),
    trust: trust(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"]
  }), /stable release channel/);
  assert.deepEqual(await listCandidates(root), []);
  assert.equal((await readHubSyncState(root)).lastEventSequence, "0");
});

function remote(fixture: Fixture): RegistryRemotePort {
  return {
    readStableManifest: async () => fixture.manifest,
    readRelease: async (releaseId) => {
      assert.equal(releaseId, fixture.release.payload.releaseId);
      return fixture.release;
    },
    readBlob: async (packageHash) => {
      assert.equal(packageHash, fixture.release.payload.packageHash);
      return fixture.blob;
    }
  };
}

async function releaseFixture(signer: Ed25519RegistrySigner, channel = "stable"): Promise<Fixture> {
  const blob = createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from("---\nname: shared-skill\ndescription: Shared workflow.\ncapabilities: [filesystem-read]\n---\n\nUse the shared workflow.\n")
  }]);
  const packageHash = await hashPackageBlob(blob);
  const release = signRegistryPayload(signer, parseRegistryRelease({
    schemaVersion: "skillloom-registry-release-v1",
    hubInstanceId,
    sequence: "8",
    releaseId: "release-8",
    name: "shared-skill",
    version: "1.0.0",
    channel,
    packageHash,
    sourceCandidateId: "cand-source-1",
    provenance: [],
    capabilities: ["filesystem-read"],
    validationDigest: `sha256:${"b".repeat(64)}`,
    supersedesReleaseHash: null,
    createdAt: "2026-07-21T00:01:00.000Z",
    createdBy: "user:promoter@example.com"
  }));
  const manifest = signRegistryPayload(signer, parseChannelManifest({
    schemaVersion: "skillloom-channel-manifest-v1",
    hubInstanceId,
    sequence: "9",
    channel,
    releases: [{
      releaseId: release.payload.releaseId,
      releaseSequence: release.payload.sequence,
      name: release.payload.name,
      version: release.payload.version,
      packageHash
    }],
    generatedAt: "2026-07-21T00:02:00.000Z"
  }));
  return { blob, release, manifest };
}

function trust(signer: Ed25519RegistrySigner) {
  return establishHubTrust(
    { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
  );
}
