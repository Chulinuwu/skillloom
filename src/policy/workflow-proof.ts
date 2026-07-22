import { PromotionPolicyError } from "../domain/errors.js";

export type WorkflowProofDecision = {
  schemaVersion: "skillloom-workflow-proof-v1";
  decisionId: string;
  idempotencyKey: string;
  verdict: "passed" | "failed";
  workflow: { artifactId: string; revision: string; contentHash: string };
  candidate: { candidateId: string; packageHash: string };
  verifier: { kind: "replay" | "held-out-evaluation"; summary: string; evidence: string };
  provenanceHashes: readonly string[];
  decidedAt: string;
};

export function assertWorkflowProofDecision(
  proof: WorkflowProofDecision | undefined,
  candidate: { candidateId: string; packageHash: string },
  provenance: readonly { artifactId: string; revision: string; contentHash: string }[] = []
): void {
  const reason = proof === undefined ? null : workflowProofError(proof, candidate, provenance);
  if (reason !== null) throw new PromotionPolicyError(reason);
}

export function authoritativeWorkflowProofError(
  storedProof: WorkflowProofDecision | undefined,
  callerProof: WorkflowProofDecision | undefined,
  candidate: { candidateId: string; packageHash: string },
  provenance: readonly { artifactId: string; revision: string; contentHash: string }[] = []
): string | null {
  if (storedProof !== undefined) {
    const storedError = workflowProofError(storedProof, candidate, provenance);
    if (storedError !== null) return storedError;
    return callerProof !== undefined && !sameWorkflowProof(storedProof, callerProof)
      ? "workflow proof override conflicts with stored candidate proof"
      : null;
  }
  return callerProof === undefined ? null : workflowProofError(callerProof, candidate, provenance);
}

export function assertAuthoritativeWorkflowProof(
  storedProof: WorkflowProofDecision | undefined,
  callerProof: WorkflowProofDecision | undefined,
  candidate: { candidateId: string; packageHash: string },
  provenance: readonly { artifactId: string; revision: string; contentHash: string }[] = []
): void {
  const reason = authoritativeWorkflowProofError(storedProof, callerProof, candidate, provenance);
  if (reason !== null) throw new PromotionPolicyError(reason);
}

export function workflowProofError(
  proof: WorkflowProofDecision,
  candidate: { candidateId: string; packageHash: string },
  provenance: readonly { artifactId: string; revision: string; contentHash: string }[] = []
): string | null {
  if (proof.verdict !== "passed") return "workflow proof did not pass";
  if (proof.candidate.candidateId !== candidate.candidateId || proof.candidate.packageHash !== candidate.packageHash) {
    return "workflow proof is not bound to the candidate package";
  }
  if (provenance.length > 0 && !provenance.some((item) => item.artifactId === proof.workflow.artifactId
    && item.revision === proof.workflow.revision
    && item.contentHash === proof.workflow.contentHash)) {
    return "workflow proof is not bound to registry provenance";
  }
  return null;
}

function sameWorkflowProof(left: WorkflowProofDecision, right: WorkflowProofDecision): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.decisionId === right.decisionId
    && left.idempotencyKey === right.idempotencyKey
    && left.verdict === right.verdict
    && left.workflow.artifactId === right.workflow.artifactId
    && left.workflow.revision === right.workflow.revision
    && left.workflow.contentHash === right.workflow.contentHash
    && left.candidate.candidateId === right.candidate.candidateId
    && left.candidate.packageHash === right.candidate.packageHash
    && left.verifier.kind === right.verifier.kind
    && left.verifier.summary === right.verifier.summary
    && left.verifier.evidence === right.verifier.evidence
    && left.decidedAt === right.decidedAt
    && sameStrings(left.provenanceHashes, right.provenanceHashes);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
