import type { SkillCapability } from "../../domain/types.js";
import type { HubTrustAnchor } from "../config/index.js";
import type { RegistryProvenanceReference } from "../registry/index.js";
import type { RegistryRemotePort } from "./reconciler.js";
import type { HubTrustMaterial } from "./trust.js";

export type StableSkillReleaseSummary = Readonly<{
  releaseId: string;
  name: string;
  version: string;
  channel: "stable";
  sequence: string;
  packageHash: string;
}>;

export type StableSkillReleaseMetadata = StableSkillReleaseSummary & Readonly<{
  capabilities: readonly SkillCapability[];
  createdAt: string;
  createdBy: string;
}>;

export type StableSkillReleaseEvidence = Readonly<{
  validationDigest: string;
  provenance: readonly RegistryProvenanceReference[];
  supersedesReleaseHash: string | null;
}>;

export type StableSkillFile = Readonly<{
  relativePath: string;
  mode: 0o644 | 0o755;
  content: string;
}>;

export type StableSkillReleaseDetails = Readonly<{
  release: StableSkillReleaseMetadata;
  evidence: StableSkillReleaseEvidence;
  files: readonly StableSkillFile[];
}>;

export type StableSkillReleaseList = Readonly<{
  channels: readonly Readonly<{
    channel: "stable";
    sequence: string;
    releases: readonly StableSkillReleaseSummary[];
  }>[];
}>;

export type RegistryReadApiOptions = Readonly<{
  remote: RegistryRemotePort;
  trust: HubTrustAnchor | null;
  hub: HubTrustMaterial;
}>;

export type RegistryReadApi = Readonly<{
  listStableReleases(limit?: number): Promise<StableSkillReleaseList>;
  readStableRelease(releaseId: string): Promise<StableSkillReleaseDetails>;
}>;
