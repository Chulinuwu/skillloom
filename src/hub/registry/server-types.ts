import type { SkillCapability, SkillMetadata, TrustFinding } from "../../domain/types.js";
import type { WorkflowProofDecision } from "../../policy/workflow-proof.js";
import type { Ed25519RegistrySigner } from "./release-signature.js";
import type {
  ChannelManifest,
  PackageBlobV1,
  RegistryCandidate,
  RegistryProvenanceReference,
  RegistryRelease,
  SignedRegistryPayload
} from "./types.js";

export type RegistryActor = Readonly<{ actorId: string }>;

export type RegistryValidationFile = Readonly<{
  relativePath: string;
  size: number;
  mode: number;
}>;

export type RegistryValidationReport = Readonly<{
  schemaVersion: "skillloom-registry-validation-v1";
  packageHash: string;
  metadata: SkillMetadata;
  capabilities: readonly SkillCapability[];
  files: readonly RegistryValidationFile[];
  findings: readonly TrustFinding[];
  validationDigest: string;
}>;

export type RegistryCandidateRecord = Readonly<{
  candidate: SignedRegistryPayload<RegistryCandidate>;
  validation: RegistryValidationReport;
}>;

export type RegistryProposalResult = RegistryCandidateRecord;

export type RegistryPublishResult = Readonly<{
  release: SignedRegistryPayload<RegistryRelease>;
  manifest: SignedRegistryPayload<ChannelManifest>;
}>;

export type ProposeRegistryInput = Readonly<{
  actor: RegistryActor;
  requestId: string;
  name: string;
  packageBlob: PackageBlobV1;
  claimedPackageHash: string;
  baseReleaseHash: string | null;
  capabilities: readonly SkillCapability[];
  provenance: readonly RegistryProvenanceReference[];
  workflowProof?: WorkflowProofDecision;
}>;

export type PublishRegistryInput = Readonly<{
  actor: RegistryActor;
  requestId: string;
  candidateId: string;
  version: string;
  channel: "stable";
  workflowProof?: WorkflowProofDecision;
}>;

export interface RegistryPermissionPort {
  requirePropose(actor: RegistryActor): Promise<void>;
  requirePublish(actor: RegistryActor): Promise<void>;
}

export type RegistryFaultPoint = "afterIntent" | "afterBlob" | "afterCandidate" | "afterRelease" | "afterManifest" | "afterIdempotency";

export type RegistryFaultInjector = (point: RegistryFaultPoint, operation: RegistryPendingOperation) => void | Promise<void>;

export type RegistryIdempotencyRecord =
  | Readonly<{
    schemaVersion: "skillloom-registry-idempotency-v1";
    action: "propose";
    actorId: string;
    requestId: string;
    payloadHash: string;
    result: RegistryProposalResult;
  }>
  | Readonly<{
    schemaVersion: "skillloom-registry-idempotency-v1";
    action: "publish";
    actorId: string;
    requestId: string;
    payloadHash: string;
    result: RegistryPublishResult;
  }>;

export type RegistryPendingOperation =
  | Readonly<{
    schemaVersion: "skillloom-registry-operation-v1";
    operationId: string;
    action: "propose";
    actorId: string;
    requestId: string;
    payloadHash: string;
    packageBlob: PackageBlobV1;
    result: RegistryProposalResult;
    createdAt: string;
  }>
  | Readonly<{
    schemaVersion: "skillloom-registry-operation-v1";
    operationId: string;
    action: "publish";
    actorId: string;
    requestId: string;
    payloadHash: string;
    result: RegistryPublishResult;
    createdAt: string;
  }>;

export type RegistryServiceDependencies = Readonly<{
  root: string;
  hubInstanceId: string;
  signer: Ed25519RegistrySigner;
  permissions: RegistryPermissionPort;
  clock?: () => Date;
  faultInjector?: RegistryFaultInjector;
}>;
