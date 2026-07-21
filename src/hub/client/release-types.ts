import type { HubTrustAnchor } from "../config/types.js";
import type { SkillCapability } from "../../domain/types.js";
import type {
  ChannelManifest,
  PackageBlobV1,
  RegistryProvenanceReference,
  RegistryRelease,
  SignedRegistryPayload
} from "../registry/types.js";
import type { HubTrustMaterial } from "./trust.js";

export type HubReleaseArtifactInput = Readonly<{
  release: SignedRegistryPayload<RegistryRelease>;
  blob: PackageBlobV1;
}>;

export type HubReleaseBundleInput = Readonly<{
  trust: HubTrustAnchor | null;
  hub: HubTrustMaterial;
  afterSequence?: string;
  allowedCapabilities: readonly SkillCapability[];
  manifest: SignedRegistryPayload<ChannelManifest>;
  artifacts: readonly HubReleaseArtifactInput[];
}>;
export type HubStableManifestVerificationInput = Readonly<{
  trust: HubTrustAnchor | null;
  hub: HubTrustMaterial;
  afterSequence?: string;
  manifest: SignedRegistryPayload<ChannelManifest>;
}>;
export type HubStableReleaseVerificationInput = Readonly<{
  trust: HubTrustAnchor | null;
  hub: HubTrustMaterial;
  manifest: SignedRegistryPayload<ChannelManifest>;
  artifact: HubReleaseArtifactInput;
}>;

export type VerifiedHubRelease = Readonly<{
  release: RegistryRelease;
  blob: PackageBlobV1;
}>;

export type VerifiedHubReleaseBundle = Readonly<{
  manifest: ChannelManifest;
  sequence: string;
  releases: readonly VerifiedHubRelease[];
}>;

export type HubReleaseCandidateReference = Readonly<{
  candidateId: string;
  packageHash: string;
  hubInstanceId: string;
  releaseId: string;
  releaseSequence: string;
  baseReleaseHash: string | null;
  provenance: readonly RegistryProvenanceReference[];
}>;
