import type { BrainActor, BrainArtifactMutationResult, BrainArtifactType, BrainJsonValue, BrainSensitivity } from "./types.js";
import type { BrainService } from "./service.js";

export type AuthoringDocumentFrontmatter = {
  skillloomAuthoring?: boolean;
  title?: string;
  type?: BrainArtifactType;
  sensitivity?: BrainSensitivity;
  canonicalArtifactId?: string;
  baseRevision?: string;
  provenance?: Record<string, BrainJsonValue>;
  frontmatter?: Record<string, BrainJsonValue>;
  stagedAt?: string;
};

export type ParsedAuthoringDocument = {
  frontmatter: AuthoringDocumentFrontmatter;
  content: string;
  errors: readonly string[];
};

export type AuthoringCheckpoint = {
  contentHash: string;
  state: "synced" | "conflict" | "quarantined";
  artifactId?: string;
  revision?: string;
};

export type AuthoringCheckpointMap = Record<string, AuthoringCheckpoint>;

export type AuthoringMutationResult =
  | { status: "captured"; artifact: BrainArtifactMutationResult }
  | { status: "updated"; artifact: BrainArtifactMutationResult }
  | { status: "conflict"; conflict: BrainArtifactMutationResult }
  | { status: "quarantined"; conflict: BrainArtifactMutationResult };

export type ObsidianAuthoringSyncItem = {
  path: string;
  contentHash?: string;
  status: "captured" | "updated" | "conflict" | "quarantined" | "refreshed" | "unchanged" | "unsettled";
  artifact?: BrainArtifactMutationResult;
  conflict?: BrainArtifactMutationResult;
};

export type ObsidianAuthoringSyncResult = {
  items: readonly ObsidianAuthoringSyncItem[];
};

export type ObsidianAuthoringSync = {
  initialize(): Promise<void>;
  sync(): Promise<ObsidianAuthoringSyncResult>;
};

export type ObsidianAuthoringSyncDependencies = {
  root: string;
  brain: BrainService;
  actor: BrainActor;
  settleMs?: number;
};
