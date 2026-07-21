import type {
  BrainActor,
  BrainArtifact,
  BrainArtifactBase,
  BrainArtifactMetadata,
  BrainArtifactType,
  BrainAuditEvent,
  BrainAuditEventDraft,
  BrainFaultPoint,
  BrainIdempotencyRecord,
  BrainLink,
  BrainMutationResult,
  BrainPendingOperation,
  BrainSearchResult
} from "./types.js";

export interface BrainPermissionPort {
  requireRead(actor: BrainActor): Promise<void>;
  requireWrite(actor: BrainActor, action: "capture" | "update" | "link"): Promise<void>;
}

export interface BrainSourceStore {
  initialize(): Promise<void>;
  stage(operationId: string, artifact: BrainArtifact): Promise<void>;
  commit(operationId: string, artifact: BrainArtifact, base?: BrainArtifactBase): Promise<void>;
  read(artifactId: string): Promise<BrainArtifact | null>;
  list(): Promise<BrainArtifact[]>;
  hasStaged(operationId: string): Promise<boolean>;
  cleanupStage(operationId: string): Promise<void>;
  cleanupOrphanStages(activeOperationIds: ReadonlySet<string>): Promise<void>;
}

export interface BrainAuditPort {
  initialize(): Promise<void>;
  append(event: BrainAuditEventDraft, result: BrainMutationResult): Promise<BrainAuditEvent>;
  readAll(): Promise<BrainAuditEvent[]>;
  latestSequence(): Promise<string>;
}

export interface BrainOperationJournalPort {
  initialize(): Promise<void>;
  write(operation: BrainPendingOperation): Promise<void>;
  list(): Promise<BrainPendingOperation[]>;
  remove(operationId: string): Promise<void>;
}

export interface BrainMetadataIndex {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getIdempotency(actorId: string, requestId: string): Promise<BrainIdempotencyRecord | null>;
  getArtifactMetadata(artifactId: string): Promise<BrainArtifactMetadata | null>;
  commit(operation: BrainPendingOperation, event: BrainAuditEvent): Promise<void>;
  rebuild(artifacts: BrainArtifact[], events: BrainAuditEvent[]): Promise<void>;
  search(query: string, type: BrainArtifactType | undefined, limit: number): Promise<BrainSearchResult[]>;
  links(artifactId: string): Promise<BrainLink[]>;
}

export type BrainFaultInjector = (point: BrainFaultPoint, operation: BrainPendingOperation) => void | Promise<void>;

export type BrainServiceDependencies = {
  root: string;
  permissions: BrainPermissionPort;
  sourceStore?: BrainSourceStore;
  audit?: BrainAuditPort;
  journal?: BrainOperationJournalPort;
  index?: BrainMetadataIndex;
  clock?: () => Date;
  faultInjector?: BrainFaultInjector;
};
