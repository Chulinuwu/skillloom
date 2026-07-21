import { strict as assert } from "node:assert";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { HubTrustAnchor } from "../../src/hub/config/index.js";
import {
  materializeHubReleaseCandidate,
  verifyHubReleaseBundle
} from "../../src/hub/client/index.js";
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
import { establishHubTrust } from "../../src/hub/client/trust.js";
import { listCandidates, readCandidate } from "../../src/store/candidates.js";
import { tempDir } from "../helpers/fixtures.js";

const hubInstanceId = "hub-primary";
const provenance = [{ artifactId: "brain:decision-1", revision: "3", contentHash: `sha256:${"a".repeat(64)}` }];

test("verifies a signed release bundle and imports the same immutable candidate into two local roots", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer);
  const verified = await verifyHubReleaseBundle({
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    afterSequence: "6",
    allowedCapabilities: ["filesystem-read"],
    manifest: fixture.manifest,
    artifacts: [{ release: fixture.release, blob: fixture.blob }]
  });
  const roots = [await tempDir("skillloom-client-a-"), await tempDir("skillloom-client-b-")];
  const references = await Promise.all(roots.map((root) => materializeHubReleaseCandidate(root, verified.releases[0]!)));

  assert.equal(verified.sequence, "9");
  assert.equal(references[0].candidateId, "cand-source-1");
  assert.deepEqual(references[0], references[1]);
  assert.equal(references[0].baseReleaseHash, fixture.release.payload.supersedesReleaseHash);
  assert.deepEqual(references[0].provenance, provenance);
  for (const root of roots) {
    const candidate = await readCandidate(root, references[0].candidateId);
    assert.equal(candidate.packageHash, fixture.release.payload.packageHash);
    assert.equal(candidate.state, "captured");
    assert.match(await readFile(join(root, ".skillloom", "candidates", candidate.candidateId, "skill", "SKILL.md"), "utf8"), /shared-skill/);
    assert.equal((await materializeHubReleaseCandidate(root, verified.releases[0]!)).candidateId, candidate.candidateId);
  }
});

test("rejects trust, signature, sequence, manifest, blob and policy tampering without a partial candidate", async () => {
  const signer = generateEd25519RegistrySigner();
  const fixture = await releaseFixture(signer);
  const root = await tempDir("skillloom-client-tamper-");
  const base = {
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"] as const,
    manifest: fixture.manifest,
    artifacts: [{ release: fixture.release, blob: fixture.blob }]
  };

  await assert.rejects(verifyHubReleaseBundle({ ...base, afterSequence: "9" }), /rollback/i);
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    manifest: { ...fixture.manifest, payload: { ...fixture.manifest.payload, channel: "preview" } }
  }), /signature/i);
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    artifacts: [{ release: { ...fixture.release, payload: { ...fixture.release.payload, version: "1.0.1" } }, blob: fixture.blob }]
  }), /signature/i);
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    hub: { hubInstanceId: "hub-other", releaseSigningPublicKey: signer.publicKey }
  }), /changed|mismatch/i);
  const otherSigner = generateEd25519RegistrySigner();
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    hub: { hubInstanceId, releaseSigningPublicKey: otherSigner.publicKey }
  }), /changed|signing key/i);
  const changedBlob = createSkillBlob("shared-skill", ["filesystem-read"], "changed");
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    artifacts: [{ release: fixture.release, blob: changedBlob }]
  }), /hash/i);
  await assert.rejects(verifyHubReleaseBundle({
    ...base,
    allowedCapabilities: []
  }), /capabilit/i);

  assert.deepEqual(await listCandidates(root), []);
  await assert.rejects(access(join(root, ".claude", "skills", "shared-skill")));
});

test("rejects manifest-release mismatch and candidate ID collision without replacing the existing snapshot", async () => {
  const signer = generateEd25519RegistrySigner();
  const first = await releaseFixture(signer);
  const mismatchedRelease = signRegistryPayload(signer, parseRegistryRelease({
    ...first.release.payload,
    version: "1.0.1"
  }));
  await assert.rejects(verifyHubReleaseBundle({
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    manifest: first.manifest,
    artifacts: [{ release: mismatchedRelease, blob: first.blob }]
  }), /manifest fields/i);
  await assert.rejects(verifyHubReleaseBundle({
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    manifest: first.manifest,
    artifacts: [{ release: first.release, blob: createSkillBlob("other-skill", ["filesystem-read"]) }]
  }), /hash|mismatch/i);

  const root = await tempDir("skillloom-client-collision-");
  const verifiedFirst = await verifyFixture(signer, first);
  const reference = await materializeHubReleaseCandidate(root, verifiedFirst.releases[0]!);
  const before = await readFile(join(root, ".skillloom", "candidates", reference.candidateId, "skill", "SKILL.md"), "utf8");
  const second = await releaseFixture(signer, { sequence: "10", manifestSequence: "11", body: "different" });
  const verifiedSecond = await verifyFixture(signer, second);

  await assert.rejects(materializeHubReleaseCandidate(root, verifiedSecond.releases[0]!), /collision|different/i);
  assert.equal(await readFile(join(root, ".skillloom", "candidates", reference.candidateId, "skill", "SKILL.md"), "utf8"), before);
  assert.equal((await listCandidates(root)).length, 1);
  const staging = await readdir(join(root, ".skillloom", "staging")).catch(() => []);
  assert.deepEqual(staging, []);
});

test("cleans isolated staging when local package validation rejects signed metadata", async () => {
  const signer = generateEd25519RegistrySigner();
  const blob = createSkillBlob("other-skill", ["filesystem-read"]);
  const packageHash = await hashPackageBlob(blob);
  const fixture = await releaseFixture(signer);
  const release = signRegistryPayload(signer, parseRegistryRelease({
    ...fixture.release.payload,
    packageHash
  }));
  const manifest = signRegistryPayload(signer, parseChannelManifest({
    ...fixture.manifest.payload,
    releases: [{ ...fixture.manifest.payload.releases[0], packageHash }]
  }));
  const verified = await verifyHubReleaseBundle({
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    manifest,
    artifacts: [{ release, blob }]
  });
  const root = await tempDir("skillloom-client-invalid-local-");

  await assert.rejects(materializeHubReleaseCandidate(root, verified.releases[0]!), /name mismatch/i);
  assert.deepEqual(await listCandidates(root), []);
  assert.deepEqual(await readdir(join(root, ".skillloom", "staging")), []);
});

type ReleaseFixture = {
  blob: PackageBlobV1;
  release: SignedRegistryPayload<RegistryRelease>;
  manifest: SignedRegistryPayload<ChannelManifest>;
};

async function releaseFixture(
  signer: Ed25519RegistrySigner,
  options: { sequence?: string; manifestSequence?: string; body?: string } = {}
): Promise<ReleaseFixture> {
  const sequence = options.sequence ?? "8";
  const blob = createSkillBlob("shared-skill", ["filesystem-read"], options.body);
  const packageHash = await hashPackageBlob(blob);
  const release = signRegistryPayload(signer, parseRegistryRelease({
    schemaVersion: "skillloom-registry-release-v1",
    hubInstanceId,
    sequence,
    releaseId: `release-${sequence}`,
    name: "shared-skill",
    version: "1.0.0",
    channel: "stable",
    packageHash,
    sourceCandidateId: "cand-source-1",
    provenance,
    capabilities: ["filesystem-read"],
    validationDigest: `sha256:${"b".repeat(64)}`,
    supersedesReleaseHash: `sha256-v2:${"c".repeat(64)}`,
    createdAt: "2026-07-21T00:01:00.000Z",
    createdBy: "user:promoter@example.com"
  }));
  const manifest = signRegistryPayload(signer, parseChannelManifest({
    schemaVersion: "skillloom-channel-manifest-v1",
    hubInstanceId,
    sequence: options.manifestSequence ?? "9",
    channel: "stable",
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

function createSkillBlob(name: string, capabilities: string[], body = "Use the shared workflow."): PackageBlobV1 {
  const capabilityLine = capabilities.length > 0 ? `capabilities: [${capabilities.join(", ")}]\n` : "";
  return createPackageBlob([{
    relativePath: "SKILL.md",
    mode: 0o644,
    content: Buffer.from(`---\nname: ${name}\ndescription: Shared workflow.\n${capabilityLine}---\n\n${body}\n`)
  }]);
}

function trustedAnchor(signer: Ed25519RegistrySigner): HubTrustAnchor {
  return establishHubTrust(
    { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
  );
}

async function verifyFixture(signer: Ed25519RegistrySigner, fixture: ReleaseFixture) {
  return await verifyHubReleaseBundle({
    trust: trustedAnchor(signer),
    hub: { hubInstanceId, releaseSigningPublicKey: signer.publicKey },
    allowedCapabilities: ["filesystem-read"],
    manifest: fixture.manifest,
    artifacts: [{ release: fixture.release, blob: fixture.blob }]
  });
}
