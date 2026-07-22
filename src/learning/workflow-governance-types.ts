import type { BrainArtifact, BrainArtifactMetadata } from "../hub/brain/types.js";
import type { CandidateRecord, PromotionRecord } from "../domain/types.js";

export type WorkflowGovernanceAction = "create" | "patch";

export type WorkflowVerifierProof =
  | {
      kind: "replay";
      status: "passed" | "failed";
      workflow: WorkflowProofBinding;
      summary: string;
      command: string;
      provenanceHashes: readonly string[];
    }
  | {
      kind: "held-out-evaluation";
      status: "passed" | "failed";
      workflow: WorkflowProofBinding;
      summary: string;
      score: number;
      threshold: number;
      provenanceHashes: readonly string[];
    };

export type WorkflowProofBinding = {
  artifactId: string;
  revision: string;
  contentHash: string;
};

export type GovernWorkflowInput = {
  projectRoot: string;
  homeDir: string;
  brain: WorkflowBrainPort;
  actorId: string;
  workflowArtifactId: string;
  operationId: string;
  action: WorkflowGovernanceAction;
  proof?: WorkflowVerifierProof;
  baseSkillPath?: string;
  promote?: WorkflowPromotionRequest;
};

export type WorkflowPromotionRequest = {
  targets: readonly WorkflowPromotionTarget[];
  scope: "project" | "user";
};

export type WorkflowPromotionTarget = "claude" | "codex" | "agents";

export type WorkflowGovernanceResult =
  | {
      status: "draft";
      reason: string;
      workflow: BrainArtifactMetadata;
    }
  | {
      status: "rejected";
      reason: string;
      workflow: BrainArtifactMetadata;
      rejectedUpdateId: string;
    }
  | {
      status: "candidate";
      workflow: BrainArtifactMetadata;
      candidate: CandidateRecord;
    }
  | {
      status: "promoted";
      workflow: BrainArtifactMetadata;
      candidate: CandidateRecord;
      promotion: PromotionRecord;
    };

export type WorkflowBrainPort = Readonly<{
  read(input: { actor: { actorId: string }; artifactId: string }): Promise<BrainArtifact>;
  capture(input: {
    actor: { actorId: string };
    requestId: string;
    type: "feedback" | "rejected-update";
    title: string;
    content: string;
    provenance: Record<string, string | number | boolean | null | readonly string[]>;
    details:
      | { kind: "feedback"; targetArtifactId: string; signal: "negative"; reason: string }
      | { kind: "rejected-update"; targetArtifactId: string; rejectedAt: string; reason: string; retryable: boolean };
    sensitivity: "private" | "tailnet" | "restricted";
  }): Promise<{ artifact: BrainArtifactMetadata }>;
}>;
