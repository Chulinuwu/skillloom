import type { BrainArtifact, CaptureBrainInput } from "../hub/brain/index.js";
import type { WorkflowVerifierProof } from "../learning/workflow-governance-types.js";

export const demoAgentA = "user:agent-a@demo.skillloom";
export const demoAgentB = "user:agent-b@demo.skillloom";
const provenanceHash = `sha256:${"a".repeat(64)}`;

export function demoWorkflowCapture(actor: CaptureBrainInput["actor"]): CaptureBrainInput {
  return {
    actor,
    requestId: "demo-workflow",
    type: "workflow",
    title: "Recover a stale Docker build",
    content: "Reuse the verified recovery steps instead of rediscovering them.",
    provenance: { provenanceHashes: [provenanceHash], source: "agent-a" },
    details: {
      kind: "workflow",
      trigger: "a Docker rebuild keeps serving stale output",
      steps: [
        "Confirm the stale behavior with the focused health check.",
        "Inspect the build inputs and cache boundary.",
        "Rebuild the affected image without reusing the stale layer.",
        "Run the focused health check again.",
        "Record the verified outcome and source."
      ],
      verifier: "focused replay",
      promotable: true
    },
    sensitivity: "tailnet"
  };
}

export function demoReplayProof(
  workflow: BrainArtifact,
  status: "passed" | "failed"
): WorkflowVerifierProof {
  return {
    kind: "replay",
    status,
    workflow: {
      artifactId: workflow.id,
      revision: workflow.revision,
      contentHash: workflow.contentHash
    },
    summary: status === "passed" ? "focused replay passed" : "focused replay failed",
    command: "node --test focused-replay.test.ts",
    provenanceHashes: [provenanceHash]
  };
}
