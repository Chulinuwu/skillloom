import type { HubAuthorizationContext } from "../auth/index.js";

export type BrainMcpToolName = "brain_search" | "brain_retrieve" | "brain_health" | "brain_read" | "brain_capture" | "brain_update" | "brain_link";
export type RegistryMcpToolName = "skill_releases" | "skill_read" | "skill_propose" | "skill_publish";
export type HubMcpToolName = BrainMcpToolName | RegistryMcpToolName;
export type RegistryMcpReleasesInput = Readonly<{ limit?: number }>;
export type RegistryMcpReadInput = Readonly<{ releaseId: string }>;

export type BrainMcpCall = {
  name: string;
  arguments: unknown;
};

export type BrainMcpTextContent = {
  type: "text";
  text: string;
};

export type BrainMcpResult = {
  content: BrainMcpTextContent[];
  structuredContent: unknown;
  isError?: true;
};

export type BrainMcpInputSchema = {
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  additionalProperties: boolean;
};

export type BrainMcpToolDefinition = {
  name: HubMcpToolName;
  description: string;
  inputSchema: BrainMcpInputSchema;
};

export type BrainMcpDispatcher = (call: BrainMcpCall, authorization: HubAuthorizationContext) => Promise<BrainMcpResult>;
