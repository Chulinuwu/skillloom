import { strict as assert } from "node:assert";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  canonicalizeJson,
  createEd25519RegistrySigner,
  createEd25519RegistryVerifier,
  createPackageBlob,
  generateEd25519RegistrySigner,
  hashPackageBlob,
  parseCanonicalJson,
  parseChannelManifest,
  parsePackageBlob,
  parseRegistryCandidate,
  parseRegistryRelease,
  signRegistryPayload,
  verifyRegistryPayload
} from "../../src/hub/registry/index.js";

const digest = (prefix = "sha256") => `${prefix}:${"a".repeat(64)}`;
const provenance = [{ artifactId: "brain:decision-1", revision: "3", contentHash: digest() }];

function candidate() {
  return {
    schemaVersion: "skillloom-registry-candidate-v1",
    hubInstanceId: "hub-primary",
    sequence: "7",
    candidateId: "candidate-1",
    name: "shared-skill",
    packageHash: digest("sha256-v2"),
    baseReleaseHash: null,
    divergence: { state: "aligned" },
    supersession: { state: "active" },
    provenance,
    capabilities: ["filesystem-read"],
    validationDigest: digest(),
    createdAt: "2026-07-21T00:00:00.000Z",
    createdBy: "user:alice@example.com"
  };
}

function release() {
  return {
    schemaVersion: "skillloom-registry-release-v1",
    hubInstanceId: "hub-primary",
    sequence: "8",
    releaseId: "release-1",
    name: "shared-skill",
    version: "1.0.0",
    channel: "stable",
    packageHash: digest("sha256-v2"),
    sourceCandidateId: "candidate-1",
    provenance,
    capabilities: ["filesystem-read"],
    validationDigest: digest(),
    supersedesReleaseHash: null,
    createdAt: "2026-07-21T00:01:00.000Z",
    createdBy: "user:promoter@example.com"
  };
}

test("canonical JSON is deterministic and rejects unsupported or non-canonical input", () => {
  assert.equal(canonicalizeJson({ z: 1, a: [true, null, "ok"] }), '{"a":[true,null,"ok"],"z":1}');
  assert.deepEqual(parseCanonicalJson('{"a":1,"b":2}'), { a: 1, b: 2 });
  assert.throws(() => parseCanonicalJson('{ "a": 1 }'), /canonical/i);
  assert.throws(() => parseCanonicalJson('{"a":1,"a":1}'), /canonical/i);
  assert.throws(() => canonicalizeJson({ value: undefined }), /unsupported/i);
  assert.throws(() => canonicalizeJson({ value: Number.NaN }), /finite/i);
  assert.throws(() => canonicalizeJson({ value: -0 }), /negative zero/i);
  assert.throws(() => canonicalizeJson({ value: new Date(0) }), /plain object/i);
  assert.throws(() => canonicalizeJson("\ud800"), /unicode/i);
  assert.throws(() => canonicalizeJson(Object.defineProperty({}, "value", { enumerable: true, get: () => 1 })), /accessor/i);
});

test("package blob preserves text bytes and hashes through the sha256-v2 authority", async () => {
  const skill = Buffer.from("---\nname: shared-skill\ndescription: Shared.\n---\n", "utf8");
  const script = Buffer.from("#!/bin/sh\necho ok\n", "utf8");
  const blob = createPackageBlob([
    { relativePath: "scripts/run.sh", mode: 0o755, content: script },
    { relativePath: "SKILL.md", mode: 0o644, content: skill }
  ]);
  assert.deepEqual(blob.files.map((file) => file.relativePath), ["SKILL.md", "scripts/run.sh"]);
  assert.deepEqual(Buffer.from(blob.files[0]?.contentBase64 ?? "", "base64"), skill);
  assert.match(await hashPackageBlob(blob), /^sha256-v2:[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(blob));
  assert.ok(Object.isFrozen(blob.files));
});

test("package parser rejects unsafe paths, duplicate files, metadata, invalid text and size", () => {
  const valid = createPackageBlob([{ relativePath: "SKILL.md", mode: 0o644, content: Buffer.from("safe\n") }]);
  const file = valid.files[0];
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, relativePath: "../SKILL.md" }] }), /path/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, relativePath: "/SKILL.md" }] }), /path/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [file, file] }), /duplicate/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, type: "symlink" }] }), /unexpected/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, contentBase64: "%%%" }] }), /base64/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, contentBase64: Buffer.from([0]).toString("base64") }] }), /binary/i);
  assert.throws(() => parsePackageBlob({ ...valid, files: [{ ...file, contentBase64: Buffer.from([0xff]).toString("base64") }] }), /utf-8/i);
  assert.throws(
    () => parsePackageBlob({ ...valid, files: [{ ...file, contentBase64: Buffer.alloc(512 * 1024 + 1, 97).toString("base64") }] }),
    /size limit/i
  );
});

test("registry parsers enforce immutable identities, sequences and lifecycle variants", () => {
  const parsedCandidate = parseRegistryCandidate(candidate());
  assert.equal(parsedCandidate.sequence, "7");
  assert.ok(Object.isFrozen(parsedCandidate));
  assert.throws(() => parseRegistryCandidate({ ...candidate(), sequence: "07" }), /sequence/i);
  assert.throws(() => parseRegistryCandidate({ ...candidate(), capabilities: ["filesystem-read", "filesystem-read"] }), /duplicate/i);
  assert.throws(() => parseRegistryCandidate({ ...candidate(), extra: true }), /unexpected/i);
  assert.throws(
    () => parseRegistryCandidate({ ...candidate(), divergence: { state: "divergent" } }),
    /currentReleaseHash/i
  );
  assert.throws(
    () => parseRegistryCandidate({ ...candidate(), divergence: { state: "divergent", currentReleaseHash: digest("sha256-v2") } }),
    /baseReleaseHash/i
  );
  assert.throws(
    () => parseRegistryCandidate({ ...candidate(), supersession: { state: "superseded" } }),
    /byCandidateId/i
  );
  assert.equal(parseRegistryRelease(release()).releaseId, "release-1");
});

test("channel manifests are strict and carry a monotonic synchronization cursor", () => {
  const manifest = parseChannelManifest({
    schemaVersion: "skillloom-channel-manifest-v1",
    hubInstanceId: "hub-primary",
    sequence: "9",
    channel: "stable",
    releases: [{
      releaseId: "release-1",
      releaseSequence: "8",
      name: "shared-skill",
      version: "1.0.0",
      packageHash: digest("sha256-v2")
    }],
    generatedAt: "2026-07-21T00:02:00.000Z"
  });
  assert.equal(manifest.releases[0]?.releaseSequence, "8");
  assert.throws(() => parseChannelManifest({ ...manifest, releases: [{ ...manifest.releases[0], releaseSequence: "10" }] }), /manifest sequence/i);
});

test("Ed25519 signatures bind canonical payload, Hub identity and monotonic sequence", () => {
  const signer = generateEd25519RegistrySigner();
  const verifier = createEd25519RegistryVerifier(signer.publicKey);
  const envelope = signRegistryPayload(signer, parseRegistryRelease(release()));
  assert.equal(verifyRegistryPayload(verifier, envelope, { hubInstanceId: "hub-primary", afterSequence: "7" }).releaseId, "release-1");
  assert.equal("privateKey" in signer, false);
  assert.throws(
    () => verifyRegistryPayload(verifier, { ...envelope, payload: { ...envelope.payload, version: "1.0.1" } }, { hubInstanceId: "hub-primary" }),
    /signature/i
  );
  assert.throws(() => verifyRegistryPayload(verifier, envelope, { hubInstanceId: "hub-other" }), /Hub instance/i);
  assert.throws(() => verifyRegistryPayload(verifier, envelope, { hubInstanceId: "hub-primary", afterSequence: "8" }), /rollback/i);
  const otherVerifier = createEd25519RegistryVerifier(generateEd25519RegistrySigner().publicKey);
  assert.throws(() => verifyRegistryPayload(otherVerifier, envelope, { hubInstanceId: "hub-primary" }), /signing key|signature/i);
});

test("Ed25519 adapters accept native keys without exposing private material", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signer = createEd25519RegistrySigner(privateKey);
  const verifier = createEd25519RegistryVerifier(publicKey);
  const envelope = signRegistryPayload(signer, parseRegistryRelease(release()));
  assert.equal(verifyRegistryPayload(verifier, envelope, { hubInstanceId: "hub-primary" }).sequence, "8");
});
