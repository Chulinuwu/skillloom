import type { SkillCapability } from "../../domain/types.js";
import {
  createEd25519RegistryVerifier,
  hashPackageBlob,
  parseChannelManifest,
  parsePackageBlob,
  parseRegistryRelease,
  verifyRegistryPayload,
  type ChannelManifest,
  type RegistryRelease,
  type RegistrySignature,
  type SignedRegistryPayload
} from "../registry/index.js";
import { HubResponseValidationError } from "./errors.js";
import type {
  HubReleaseBundleInput,
  HubStableManifestVerificationInput,
  HubStableReleaseVerificationInput,
  VerifiedHubRelease,
  VerifiedHubReleaseBundle
} from "./release-types.js";
import { verifyHubTrust } from "./trust.js";

export async function verifyHubReleaseBundle(input: HubReleaseBundleInput): Promise<VerifiedHubReleaseBundle> {
  const verifier = trustedVerifier(input.trust, input.hub);
  const manifest = verifyManifest(verifier, input);
  const allowedCapabilities = new Set(input.allowedCapabilities);
  const artifacts = new Map<string, VerifiedHubRelease>();
  for (const artifact of input.artifacts) {
    const releaseEnvelope = parseSignedEnvelope(artifact.release, parseRegistryRelease);
    const release = verifyRegistryPayload(verifier, releaseEnvelope, { hubInstanceId: input.hub.hubInstanceId });
    if (artifacts.has(release.releaseId)) {
      throw new HubResponseValidationError(`Duplicate release artifact: ${release.releaseId}`);
    }
    assertCapabilitiesAllowed(release.capabilities, allowedCapabilities);
    const blob = parsePackageBlob(artifact.blob);
    if (await hashPackageBlob(blob) !== release.packageHash) {
      throw new HubResponseValidationError(`Package blob hash mismatch for release ${release.releaseId}`);
    }
    artifacts.set(release.releaseId, Object.freeze({ release, blob }));
  }
  const releases = manifest.releases.map((entry) => {
    const artifact = artifacts.get(entry.releaseId);
    if (!artifact) throw new HubResponseValidationError(`Missing release artifact: ${entry.releaseId}`);
    assertManifestEntry(manifest, entry, artifact.release);
    artifacts.delete(entry.releaseId);
    return artifact;
  });
  if (artifacts.size > 0) {
    throw new HubResponseValidationError(`Release artifact is not present in manifest: ${artifacts.keys().next().value}`);
  }
  return Object.freeze({ manifest, sequence: manifest.sequence, releases: Object.freeze(releases) });
}
export function verifyHubStableManifest(input: HubStableManifestVerificationInput): ChannelManifest {
  const manifest = verifyManifest(trustedVerifier(input.trust, input.hub), input);
  assertStableManifest(manifest);
  return manifest;
}
export async function verifyHubStableRelease(input: HubStableReleaseVerificationInput): Promise<VerifiedHubRelease> {
  const verifier = trustedVerifier(input.trust, input.hub);
  const manifest = verifyManifest(verifier, input);
  assertStableManifest(manifest);
  const releaseEnvelope = parseSignedEnvelope(input.artifact.release, parseRegistryRelease);
  const release = verifyRegistryPayload(verifier, releaseEnvelope, { hubInstanceId: input.hub.hubInstanceId });
  const entry = manifest.releases.find((candidate) => candidate.releaseId === release.releaseId);
  if (!entry) throw new HubResponseValidationError(`Release is not approved by the stable manifest: ${release.releaseId}`);
  assertManifestEntry(manifest, entry, release);
  const blob = parsePackageBlob(input.artifact.blob);
  if (await hashPackageBlob(blob) !== release.packageHash) {
    throw new HubResponseValidationError(`Package blob hash mismatch for release ${release.releaseId}`);
  }
  return Object.freeze({ release, blob });
}
function trustedVerifier(trust: HubReleaseBundleInput["trust"], hub: HubReleaseBundleInput["hub"]) {
  verifyHubTrust(trust, hub);
  return createEd25519RegistryVerifier(hub.releaseSigningPublicKey);
}
function verifyManifest(
  verifier: ReturnType<typeof createEd25519RegistryVerifier>,
  input: HubStableManifestVerificationInput
): ChannelManifest {
  const manifestEnvelope = parseSignedEnvelope(input.manifest, parseChannelManifest);
  return verifyRegistryPayload(verifier, manifestEnvelope, {
    hubInstanceId: input.hub.hubInstanceId,
    ...(input.afterSequence === undefined ? {} : { afterSequence: input.afterSequence })
  });
}
function assertStableManifest(manifest: ChannelManifest): void {
  if (manifest.channel !== "stable") {
    throw new HubResponseValidationError("Skill readers accept only the stable release channel");
  }
}

function parseSignedEnvelope<T extends ChannelManifest | RegistryRelease>(
  value: unknown,
  parsePayload: (payload: unknown) => T
): SignedRegistryPayload<T> {
  assertKeys(value, ["payload", "signature"], "signed registry envelope");
  assertKeys(value.signature, ["algorithm", "keyFingerprint", "value"], "registry signature");
  if (value.signature.algorithm !== "Ed25519"
    || typeof value.signature.keyFingerprint !== "string"
    || typeof value.signature.value !== "string") {
    throw new HubResponseValidationError("Registry signature is malformed");
  }
  const signature: RegistrySignature = Object.freeze({
    algorithm: "Ed25519",
    keyFingerprint: value.signature.keyFingerprint,
    value: value.signature.value
  });
  return Object.freeze({ payload: parsePayload(value.payload), signature });
}

function assertManifestEntry(
  manifest: ChannelManifest,
  entry: ChannelManifest["releases"][number],
  release: RegistryRelease
): void {
  if (release.channel !== manifest.channel
    || release.sequence !== entry.releaseSequence
    || release.name !== entry.name
    || release.version !== entry.version
    || release.packageHash !== entry.packageHash) {
    throw new HubResponseValidationError(`Manifest fields do not match signed release ${entry.releaseId}`);
  }
}

function assertCapabilitiesAllowed(
  capabilities: readonly SkillCapability[],
  allowedCapabilities: ReadonlySet<SkillCapability>
): void {
  const broadened = capabilities.find((capability) => !allowedCapabilities.has(capability));
  if (broadened) {
    throw new HubResponseValidationError(`Release capability is not allowed by local policy: ${broadened}`);
  }
}

function assertKeys(value: unknown, keys: readonly string[], field: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) throw new HubResponseValidationError(`${field} must be a plain object`);
  const expected = new Set(keys);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string" || !expected.has(key))) {
    throw new HubResponseValidationError(`${field} contains an unexpected field`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new HubResponseValidationError(`${field}.${key} is required`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new HubResponseValidationError(`${field}.${key} must be a plain data field`);
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
