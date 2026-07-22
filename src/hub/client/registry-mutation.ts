import type { SkillCapability } from "../../domain/types.js";
import type { WorkflowProofDecision } from "../../policy/workflow-proof.js";
import type { RegistryProposalResult, RegistryProvenanceReference, RegistryPublishResult } from "../registry/index.js";
import { executeDurableHubMutation } from "./durable-mutation.js";
import { parseRegistryProposalEnvelope, parseRegistryPublishEnvelope } from "./registry-mutation-schema.js";
import type { HubHttpClient } from "./transport-types.js";

export type RegistryMutationFileInput = Readonly<{
  relativePath: string;
  mode: 0o644 | 0o755;
  content: string;
}>;

export type RegistryProposalClientInput = Readonly<{
  name: string;
  baseReleaseHash: string | null;
  capabilities: readonly SkillCapability[];
  provenance: readonly RegistryProvenanceReference[];
  files: readonly RegistryMutationFileInput[];
  workflowProof?: WorkflowProofDecision;
}>;

export type RegistryMutationApi = Readonly<{
  propose(requestId: string, input: RegistryProposalClientInput): Promise<RegistryProposalResult>;
  publish(requestId: string, candidateId: string, version: string, workflowProof?: WorkflowProofDecision): Promise<RegistryPublishResult>;
}>;

export function createRegistryMutationApi(root: string, client: HubHttpClient): RegistryMutationApi {
  return {
    propose: async (requestId, input) => await executeDurableHubMutation({
      root,
      client,
      input: { requestId, method: "POST", path: "/v1/registry/proposals", body: JSON.stringify(input), createdAt: new Date().toISOString() },
      replayable: true,
      parse: parseRegistryProposalEnvelope
    }),
    publish: async (requestId, candidateId, version, workflowProof) => await executeDurableHubMutation({
      root,
      client,
      input: {
        requestId,
        method: "POST",
        path: "/v1/registry/releases",
        body: JSON.stringify({ candidateId, version, channel: "stable", ...(workflowProof === undefined ? {} : { workflowProof }) }),
        createdAt: new Date().toISOString()
      },
      replayable: true,
      parse: parseRegistryPublishEnvelope
    })
  };
}
