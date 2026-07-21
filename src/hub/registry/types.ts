import type { SkillCapability } from "../../domain/types.js";
export type RegistryJsonValue = null | boolean | number | string | RegistryJsonValue[] | { [key: string]: RegistryJsonValue };
export type PackageBlobFileV1 = Readonly<{
  relativePath: string;
  mode: 420 | 493;
  contentBase64: string;
}>;
export type PackageBlobV1 = Readonly<{
  schemaVersion: "skillloom-package-blob-v1";
  files: readonly PackageBlobFileV1[];
}>;
export type RegistryProvenanceReference = Readonly<{
  artifactId: string;
  revision: string;
  contentHash: string;
}>;
export type RegistryDivergence =
  | Readonly<{ state: "aligned" }>
  | Readonly<{ state: "divergent"; currentReleaseHash: string }>;
export type RegistrySupersession =
  | Readonly<{ state: "active" }>
  | Readonly<{ state: "superseded"; byCandidateId: string }>;
export type RegistryCandidate = Readonly<{
  schemaVersion: "skillloom-registry-candidate-v1";
  hubInstanceId: string;
  sequence: string;
  candidateId: string;
  name: string;
  packageHash: string;
  baseReleaseHash: string | null;
  divergence: RegistryDivergence;
  supersession: RegistrySupersession;
  provenance: readonly RegistryProvenanceReference[];
  capabilities: readonly SkillCapability[];
  validationDigest: string;
  createdAt: string;
  createdBy: string;
}>;
export type RegistryRelease = Readonly<{
  schemaVersion: "skillloom-registry-release-v1";
  hubInstanceId: string;
  sequence: string;
  releaseId: string;
  name: string;
  version: string;
  channel: string;
  packageHash: string;
  sourceCandidateId: string;
  provenance: readonly RegistryProvenanceReference[];
  capabilities: readonly SkillCapability[];
  validationDigest: string;
  supersedesReleaseHash: string | null;
  createdAt: string;
  createdBy: string;
}>;
export type ChannelManifestRelease = Readonly<{
  releaseId: string;
  releaseSequence: string;
  name: string;
  version: string;
  packageHash: string;
}>;
export type ChannelManifest = Readonly<{
  schemaVersion: "skillloom-channel-manifest-v1";
  hubInstanceId: string;
  sequence: string;
  channel: string;
  releases: readonly ChannelManifestRelease[];
  generatedAt: string;
}>;
export type RegistrySignablePayload = RegistryCandidate | RegistryRelease | ChannelManifest;
export type RegistrySignature = Readonly<{
  algorithm: "Ed25519";
  keyFingerprint: string;
  value: string;
}>;
export type SignedRegistryPayload<T extends RegistrySignablePayload = RegistrySignablePayload> = Readonly<{
  payload: T;
  signature: RegistrySignature;
}>;
