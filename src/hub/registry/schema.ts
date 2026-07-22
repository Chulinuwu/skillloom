import type { SkillCapability } from "../../domain/types.js";
import { parseWorkflowProofDecision } from "../../policy/workflow-proof-schema.js";
import { RegistryValidationError } from "./errors.js";
import type {
  ChannelManifest,
  ChannelManifestRelease,
  RegistryCandidate,
  RegistryDivergence,
  RegistryProvenanceReference,
  RegistryRelease,
  RegistrySupersession
} from "./types.js";

export function parseRegistryCandidate(value: unknown): RegistryCandidate {
  const record = strictRecord(value, [
    "schemaVersion", "hubInstanceId", "sequence", "candidateId", "name", "packageHash", "baseReleaseHash",
    "divergence", "supersession", "provenance", "capabilities", "validationDigest", "createdAt", "createdBy", "governedWorkflowProof"
  ], "candidate");
  literal(record.schemaVersion, "skillloom-registry-candidate-v1", "schemaVersion");
  const baseReleaseHash = nullablePackageHash(record.baseReleaseHash, "baseReleaseHash");
  const divergence = parseDivergence(record.divergence);
  if (divergence.state === "divergent" && baseReleaseHash === null) {
    throw new RegistryValidationError("A divergent candidate requires baseReleaseHash");
  }
  if (divergence.state === "divergent" && divergence.currentReleaseHash === baseReleaseHash) {
    throw new RegistryValidationError("A divergent candidate currentReleaseHash must differ from baseReleaseHash");
  }
  return deepFreeze({
    schemaVersion: "skillloom-registry-candidate-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: sequence(record.sequence, "sequence"),
    candidateId: identifier(record.candidateId, "candidateId"),
    name: identifier(record.name, "name"),
    packageHash: packageHash(record.packageHash, "packageHash"),
    baseReleaseHash,
    divergence,
    supersession: parseSupersession(record.supersession),
    provenance: parseProvenance(record.provenance),
    capabilities: parseCapabilities(record.capabilities),
    validationDigest: digest(record.validationDigest, "validationDigest"),
    ...(record.governedWorkflowProof === undefined ? {} : { governedWorkflowProof: parseWorkflowProofDecision(record.governedWorkflowProof, registryError, "governedWorkflowProof") }),
    createdAt: timestamp(record.createdAt, "createdAt"),
    createdBy: identifier(record.createdBy, "createdBy")
  });
}
export function parseRegistryRelease(value: unknown): RegistryRelease {
  const record = strictRecord(value, [
    "schemaVersion", "hubInstanceId", "sequence", "releaseId", "name", "version", "channel", "packageHash",
    "sourceCandidateId", "provenance", "capabilities", "validationDigest", "supersedesReleaseHash", "createdAt", "createdBy"
  ], "release");
  literal(record.schemaVersion, "skillloom-registry-release-v1", "schemaVersion");
  return deepFreeze({
    schemaVersion: "skillloom-registry-release-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: sequence(record.sequence, "sequence"),
    releaseId: identifier(record.releaseId, "releaseId"),
    name: identifier(record.name, "name"),
    version: semanticVersion(record.version),
    channel: identifier(record.channel, "channel"),
    packageHash: packageHash(record.packageHash, "packageHash"),
    sourceCandidateId: identifier(record.sourceCandidateId, "sourceCandidateId"),
    provenance: parseProvenance(record.provenance),
    capabilities: parseCapabilities(record.capabilities),
    validationDigest: digest(record.validationDigest, "validationDigest"),
    supersedesReleaseHash: nullablePackageHash(record.supersedesReleaseHash, "supersedesReleaseHash"),
    createdAt: timestamp(record.createdAt, "createdAt"),
    createdBy: identifier(record.createdBy, "createdBy")
  });
}
export function parseChannelManifest(value: unknown): ChannelManifest {
  const record = strictRecord(value, ["schemaVersion", "hubInstanceId", "sequence", "channel", "releases", "generatedAt"], "channel manifest");
  literal(record.schemaVersion, "skillloom-channel-manifest-v1", "schemaVersion");
  const manifestSequence = sequence(record.sequence, "sequence");
  if (!Array.isArray(record.releases)) throw new RegistryValidationError("releases must be an array");
  const releases = record.releases.map((item, index) => parseManifestRelease(item, index));
  unique(releases.map((item) => item.releaseId), "releaseId");
  unique(releases.map((item) => item.name), "release name");
  unique(releases.map((item) => item.releaseSequence), "release sequence");
  if (releases.some((item) => BigInt(item.releaseSequence) > BigInt(manifestSequence))) {
    throw new RegistryValidationError("Release sequence cannot exceed the manifest sequence");
  }
  return deepFreeze({
    schemaVersion: "skillloom-channel-manifest-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: manifestSequence,
    channel: identifier(record.channel, "channel"),
    releases,
    generatedAt: timestamp(record.generatedAt, "generatedAt")
  });
}
export function isCanonicalRegistrySequence(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}
function parseManifestRelease(value: unknown, index: number): ChannelManifestRelease {
  const record = strictRecord(value, ["releaseId", "releaseSequence", "name", "version", "packageHash"], `releases[${index}]`);
  return {
    releaseId: identifier(record.releaseId, `releases[${index}].releaseId`),
    releaseSequence: sequence(record.releaseSequence, `releases[${index}].releaseSequence`),
    name: identifier(record.name, `releases[${index}].name`),
    version: semanticVersion(record.version),
    packageHash: packageHash(record.packageHash, `releases[${index}].packageHash`)
  };
}
function parseDivergence(value: unknown): RegistryDivergence {
  if (!isRecord(value) || typeof value.state !== "string") throw new RegistryValidationError("divergence must be an object");
  if (value.state === "aligned") {
    strictRecord(value, ["state"], "divergence");
    return { state: "aligned" };
  }
  if (value.state === "divergent") {
    const record = strictRecord(value, ["state", "currentReleaseHash"], "divergence");
    return { state: "divergent", currentReleaseHash: packageHash(record.currentReleaseHash, "divergence.currentReleaseHash") };
  }
  throw new RegistryValidationError("divergence.state is invalid");
}
function parseSupersession(value: unknown): RegistrySupersession {
  if (!isRecord(value) || typeof value.state !== "string") throw new RegistryValidationError("supersession must be an object");
  if (value.state === "active") {
    strictRecord(value, ["state"], "supersession");
    return { state: "active" };
  }
  if (value.state === "superseded") {
    const record = strictRecord(value, ["state", "byCandidateId"], "supersession");
    return { state: "superseded", byCandidateId: identifier(record.byCandidateId, "supersession.byCandidateId") };
  }
  throw new RegistryValidationError("supersession.state is invalid");
}
function parseProvenance(value: unknown): RegistryProvenanceReference[] {
  if (!Array.isArray(value)) throw new RegistryValidationError("provenance must be an array");
  const parsed = value.map((item, index) => {
    const record = strictRecord(item, ["artifactId", "revision", "contentHash"], `provenance[${index}]`);
    return {
      artifactId: identifier(record.artifactId, `provenance[${index}].artifactId`),
      revision: sequence(record.revision, `provenance[${index}].revision`),
      contentHash: digest(record.contentHash, `provenance[${index}].contentHash`)
    };
  });
  unique(parsed.map((item) => item.artifactId), "provenance artifactId");
  return parsed;
}
function parseCapabilities(value: unknown): SkillCapability[] {
  const allowed = new Set<SkillCapability>(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item): item is SkillCapability => typeof item === "string" && allowed.has(item as SkillCapability))) {
    throw new RegistryValidationError("capabilities contains an invalid capability");
  }
  unique(value, "capability");
  return [...value];
}
function strictRecord(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new RegistryValidationError(`${field} must be an object`);
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) throw new RegistryValidationError(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys as string[]) {
    if (!expected.has(key)) throw new RegistryValidationError(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new RegistryValidationError(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (key === "governedWorkflowProof") continue;
    if (!Object.hasOwn(value, key)) throw new RegistryValidationError(`${field}.${key} is required`);
  }
  return value;
}
function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw new RegistryValidationError(`${field} must be a canonical non-empty string`);
  }
  return value;
}
function sequence(value: unknown, field: string): string {
  if (!isCanonicalRegistrySequence(value)) throw new RegistryValidationError(`${field} must be a canonical nonnegative decimal sequence`);
  return value;
}
function packageHash(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) {
    throw new RegistryValidationError(`${field} must be a sha256-v2 package hash`);
  }
  return value;
}
function nullablePackageHash(value: unknown, field: string): string | null {
  return value === null ? null : packageHash(value, field);
}
function digest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new RegistryValidationError(`${field} must be a SHA-256 digest`);
  }
  return value;
}
function semanticVersion(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
    throw new RegistryValidationError("version must be a canonical semantic version");
  }
  return value;
}
function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new RegistryValidationError(`${field} must be a canonical ISO timestamp`);
  }
  return value;
}
function literal(value: unknown, expected: string, field: string): void {
  if (value !== expected) throw new RegistryValidationError(`${field} must equal ${expected}`);
}
function unique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new RegistryValidationError(`${field} contains a duplicate value`);
}
function registryError(message: string): RegistryValidationError {
  return new RegistryValidationError(message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
