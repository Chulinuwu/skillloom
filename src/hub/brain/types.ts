export type BrainJsonValue = null | boolean | number | string | BrainJsonValue[] | { [key: string]: BrainJsonValue };

export type BrainArtifactType = "note" | "fact" | "decision" | "source" | "project" | "memory";

export type BrainSensitivity = "private" | "tailnet" | "restricted";

export type BrainActor = {
  actorId: string;
};

export type BrainArtifact = {
  id: string;
  type: BrainArtifactType;
  path: string;
  revision: string;
  contentHash: string;
  title: string;
  content: string;
  frontmatter: Record<string, BrainJsonValue>;
  provenance: Record<string, BrainJsonValue>;
  sensitivity: BrainSensitivity;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type BrainArtifactMetadata = Omit<BrainArtifact, "content">;

export type BrainArtifactBase = {
  revision: string;
  contentHash: string;
};

export type BrainLink = {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationship: string;
  createdAt: string;
  createdBy: string;
};

export type BrainArtifactMutationResult = {
  kind: "artifact";
  artifact: BrainArtifactMetadata;
  eventSequence: string;
};

export type BrainLinkMutationResult = {
  kind: "link";
  link: BrainLink;
  eventSequence: string;
};

export type BrainMutationResult = BrainArtifactMutationResult | BrainLinkMutationResult;

export type BrainSearchResult = BrainArtifactMetadata & {
  excerpt: string;
};

export type BrainAuditEvent = {
  sequence: string;
  eventId: string;
  kind: "brain.captured" | "brain.updated" | "brain.linked";
  actor: BrainActor;
  resource: {
    kind: "brain-artifact" | "brain-link";
    id: string;
    revision?: string;
  };
  requestId: string;
  payloadHash: string;
  result: BrainMutationResult;
  createdAt: string;
};

export type BrainAuditEventDraft = Omit<BrainAuditEvent, "sequence" | "result">;

export type BrainArtifactPendingOperation = {
  version: 1;
  operationId: string;
  action: "capture" | "update";
  actor: BrainActor;
  requestId: string;
  payloadHash: string;
  artifact: BrainArtifact;
  base?: BrainArtifactBase;
  event: BrainAuditEventDraft;
  createdAt: string;
};

export type BrainLinkPendingOperation = {
  version: 1;
  operationId: string;
  action: "link";
  actor: BrainActor;
  requestId: string;
  payloadHash: string;
  link: BrainLink;
  event: BrainAuditEventDraft;
  createdAt: string;
};

export type BrainPendingOperation = BrainArtifactPendingOperation | BrainLinkPendingOperation;

export type BrainIdempotencyRecord = {
  actorId: string;
  requestId: string;
  payloadHash: string;
  result: BrainMutationResult;
};

export type BrainFaultPoint = "beforeRename" | "afterRename" | "afterAudit" | "afterIndexCommit";

export type CaptureBrainInput = {
  actor: BrainActor;
  requestId: string;
  type: BrainArtifactType;
  title: string;
  content: string;
  frontmatter?: Record<string, BrainJsonValue>;
  provenance: Record<string, BrainJsonValue>;
  sensitivity: BrainSensitivity;
};

export type UpdateBrainInput = {
  actor: BrainActor;
  requestId: string;
  artifactId: string;
  baseRevision: string;
  type?: BrainArtifactType;
  title?: string;
  content?: string;
  frontmatter?: Record<string, BrainJsonValue>;
  provenance?: Record<string, BrainJsonValue>;
  sensitivity?: BrainSensitivity;
};

export type LinkBrainInput = {
  actor: BrainActor;
  requestId: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationship: string;
};

export type SearchBrainInput = {
  actor: BrainActor;
  query: string;
  type?: BrainArtifactType;
  limit?: number;
};
