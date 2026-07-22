export type BrainJsonValue = null | boolean | number | string | BrainJsonValue[] | { [key: string]: BrainJsonValue };

export type BrainArtifactType =
  | "note"
  | "fact"
  | "decision"
  | "source"
  | "source-observation"
  | "project"
  | "memory"
  | "claim"
  | "entity"
  | "concept"
  | "bounded-episode"
  | "workflow"
  | "feedback"
  | "rejected-update"
  | "skill-candidate"
  | "skill-release"
  | "hot-context"
  | "index-chunk"
  | "health-report";

export type BrainArtifactLayer = "evidence" | "human-knowledge" | "agent-knowledge" | "workflow" | "skill" | "derived";

export type BrainSensitivity = "private" | "tailnet" | "restricted";

export type BrainActor = {
  actorId: string;
};

export type BrainSourceMetadata = {
  sourceId: string;
  capturedAt: string;
  contentHash: string;
  uri?: string;
  title?: string;
  mediaType?: string;
  fetchedAt?: string;
  retrievedBy?: string;
};

export type BrainNoneDetails = {
  kind: "none";
};

export type BrainKnowledgeDetails = {
  kind: "knowledge";
  status: "draft" | "accepted" | "disputed" | "superseded";
  confidence?: number;
  entities?: readonly string[];
  concepts?: readonly string[];
};

export type BrainEpisodeDetails = {
  kind: "episode";
  taskId: string;
  hostId: string;
  startedAt: string;
  endedAt?: string;
  outcome: "success" | "failure" | "partial" | "cancelled";
};

export type BrainWorkflowDetails = {
  kind: "workflow";
  trigger: string;
  steps: readonly string[];
  verifier?: string;
  promotable: boolean;
};

export type BrainFeedbackDetails = {
  kind: "feedback";
  targetArtifactId: string;
  signal: "positive" | "negative" | "correction";
  reason: string;
};

export type BrainRejectedUpdateDetails = {
  kind: "rejected-update";
  targetArtifactId: string;
  rejectedAt: string;
  reason: string;
  retryable: boolean;
};

export type BrainArtifactDetails =
  | BrainNoneDetails
  | BrainKnowledgeDetails
  | BrainEpisodeDetails
  | BrainWorkflowDetails
  | BrainFeedbackDetails
  | BrainRejectedUpdateDetails;

export type BrainArtifact = {
  id: string;
  type: BrainArtifactType;
  layer: BrainArtifactLayer;
  path: string;
  revision: string;
  contentHash: string;
  title: string;
  content: string;
  frontmatter: Record<string, BrainJsonValue>;
  provenance: Record<string, BrainJsonValue>;
  source?: BrainSourceMetadata;
  details: BrainArtifactDetails;
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
  layer?: BrainArtifactLayer;
  frontmatter?: Record<string, BrainJsonValue>;
  provenance: Record<string, BrainJsonValue>;
  source?: BrainSourceMetadata;
  details?: BrainArtifactDetails;
  sensitivity: BrainSensitivity;
};

export type UpdateBrainInput = {
  actor: BrainActor;
  requestId: string;
  artifactId: string;
  baseRevision: string;
  type?: BrainArtifactType;
  layer?: BrainArtifactLayer;
  title?: string;
  content?: string;
  frontmatter?: Record<string, BrainJsonValue>;
  provenance?: Record<string, BrainJsonValue>;
  details?: BrainArtifactDetails;
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
export type ListBrainInput = {
  actor: BrainActor;
  type?: BrainArtifactType;
};
export type SourceExtractionInput = {
  type: "claim" | "fact" | "entity" | "concept" | "decision" | "project";
  title: string;
  content: string;
  requestId: string;
  confidence?: number;
  entities?: readonly string[];
  concepts?: readonly string[];
  contradicts?: readonly string[];
  fillsGaps?: readonly string[];
};
export type SourceGapInput = {
  requestId: string;
  title: string;
  question: string;
};
export type IngestSourceInput = {
  actor: BrainActor;
  requestId: string;
  title: string;
  content: string;
  capturedAt: string;
  uri?: string;
  mediaType?: string;
  fetchedAt?: string;
  retrievedBy?: string;
  sensitivity: BrainSensitivity;
  frontmatter?: Record<string, BrainJsonValue>;
  provenance: Record<string, BrainJsonValue>;
  extractions?: readonly SourceExtractionInput[];
  gaps?: readonly SourceGapInput[];
};
export type IngestSourceResult = {
  source: BrainArtifactMutationResult;
  extracted: BrainArtifactMutationResult[];
  links: BrainLinkMutationResult[];
  gaps: BrainArtifactMutationResult[];
};
export type HumanInboxImportResult = {
  path: string;
  contentHash: string;
  imported: boolean;
  artifact?: BrainArtifactMutationResult;
  conflict?: BrainArtifactMutationResult;
};
