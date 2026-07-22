import { BrainStorageCorruptionError } from "./errors.js";
import type {
  BrainArtifactDetails,
  BrainArtifactLayer,
  BrainArtifactType,
  BrainEpisodeDetails,
  BrainFeedbackDetails,
  BrainKnowledgeDetails,
  BrainRejectedUpdateDetails,
  BrainSourceMetadata,
  BrainWorkflowDetails
} from "./types.js";
import { brainArtifactLayers, defaultBrainLayer } from "./vocabulary.js";

const artifactLayers: ReadonlySet<string> = new Set(brainArtifactLayers);

export function parseBrainArtifactLayer(value: unknown): BrainArtifactLayer {
  if (value === "evidence"
    || value === "human-knowledge"
    || value === "agent-knowledge"
    || value === "workflow"
    || value === "skill"
    || value === "derived") {
    return value;
  }
  throw new BrainStorageCorruptionError("Brain artifact layer is malformed");
}

export function parseBrainSourceMetadata(value: unknown): BrainSourceMetadata {
  if (!isRecord(value)
    || typeof value.sourceId !== "string"
    || typeof value.capturedAt !== "string"
    || typeof value.contentHash !== "string"
    || optionalStringMalformed(value.uri)
    || optionalStringMalformed(value.title)
    || optionalStringMalformed(value.mediaType)
    || optionalStringMalformed(value.fetchedAt)
    || optionalStringMalformed(value.retrievedBy)) {
    throw new BrainStorageCorruptionError("Brain source metadata is malformed");
  }
  const uri = optionalString(value.uri);
  const title = optionalString(value.title);
  const mediaType = optionalString(value.mediaType);
  const fetchedAt = optionalString(value.fetchedAt);
  const retrievedBy = optionalString(value.retrievedBy);
  validateIsoTimestamp(value.capturedAt, "capturedAt");
  if (fetchedAt !== undefined) validateIsoTimestamp(fetchedAt, "fetchedAt");
  return {
    sourceId: value.sourceId,
    capturedAt: value.capturedAt,
    contentHash: value.contentHash,
    ...(uri === undefined ? {} : { uri }),
    ...(title === undefined ? {} : { title }),
    ...(mediaType === undefined ? {} : { mediaType }),
    ...(fetchedAt === undefined ? {} : { fetchedAt }),
    ...(retrievedBy === undefined ? {} : { retrievedBy })
  };
}

function validateIsoTimestamp(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new BrainStorageCorruptionError(`Brain source metadata ${field} is malformed`);
  }
}

export function parseBrainArtifactDetails(value: unknown): BrainArtifactDetails {
  if (!isRecord(value)) {
    throw new BrainStorageCorruptionError("Brain artifact details are malformed");
  }
  if (Object.keys(value).length === 0 || value.kind === "none") return { kind: "none" };
  if (value.kind === "knowledge" || isRecord(value.knowledge)) return parseKnowledgeDetails(value.kind === "knowledge" ? value : value.knowledge);
  if (value.kind === "episode" || isRecord(value.episode)) return parseEpisodeDetails(value.kind === "episode" ? value : value.episode);
  if (value.kind === "workflow" || isRecord(value.workflow)) return parseWorkflowDetails(value.kind === "workflow" ? value : value.workflow);
  if (value.kind === "feedback" || isRecord(value.feedback)) return parseFeedbackDetails(value.kind === "feedback" ? value : value.feedback);
  if (value.kind === "rejected-update" || isRecord(value.rejectedUpdate)) {
    return parseRejectedUpdateDetails(value.kind === "rejected-update" ? value : value.rejectedUpdate);
  }
  throw new BrainStorageCorruptionError("Brain artifact details kind is malformed");
}

export function validateBrainArtifactConsistency(type: BrainArtifactType, layer: BrainArtifactLayer, details: BrainArtifactDetails): void {
  if (!artifactLayers.has(layer) || layer !== defaultBrainLayer(type)) {
    throw new BrainStorageCorruptionError("Brain artifact layer does not match artifact type");
  }
  if (!detailKindAllowed(type, details.kind)) {
    throw new BrainStorageCorruptionError("Brain artifact details do not match artifact type");
  }
}

function parseKnowledgeDetails(value: unknown): BrainKnowledgeDetails {
  if (!isRecord(value) || !isKnowledgeStatus(value.status)
    || (value.confidence !== undefined && (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1))
    || (value.entities !== undefined && !isStringArray(value.entities))
    || (value.concepts !== undefined && !isStringArray(value.concepts))) {
    throw new BrainStorageCorruptionError("Brain knowledge details are malformed");
  }
  return {
    kind: "knowledge",
    status: value.status,
    ...(value.confidence === undefined ? {} : { confidence: value.confidence }),
    ...(value.entities === undefined ? {} : { entities: value.entities }),
    ...(value.concepts === undefined ? {} : { concepts: value.concepts })
  };
}

function parseEpisodeDetails(value: unknown): BrainEpisodeDetails {
  if (!isRecord(value)
    || typeof value.taskId !== "string"
    || typeof value.hostId !== "string"
    || typeof value.startedAt !== "string"
    || optionalStringMalformed(value.endedAt)
    || !isEpisodeOutcome(value.outcome)) {
    throw new BrainStorageCorruptionError("Brain episode details are malformed");
  }
  const endedAt = optionalString(value.endedAt);
  return {
    kind: "episode",
    taskId: value.taskId,
    hostId: value.hostId,
    startedAt: value.startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
    outcome: value.outcome
  };
}

function parseWorkflowDetails(value: unknown): BrainWorkflowDetails {
  if (!isRecord(value)
    || typeof value.trigger !== "string"
    || !isStringArray(value.steps)
    || optionalStringMalformed(value.verifier)
    || typeof value.promotable !== "boolean") {
    throw new BrainStorageCorruptionError("Brain workflow details are malformed");
  }
  const verifier = optionalString(value.verifier);
  return {
    kind: "workflow",
    trigger: value.trigger,
    steps: value.steps,
    ...(verifier === undefined ? {} : { verifier }),
    promotable: value.promotable
  };
}

function parseFeedbackDetails(value: unknown): BrainFeedbackDetails {
  if (!isRecord(value)
    || typeof value.targetArtifactId !== "string"
    || !isFeedbackSignal(value.signal)
    || typeof value.reason !== "string") {
    throw new BrainStorageCorruptionError("Brain feedback details are malformed");
  }
  return {
    kind: "feedback",
    targetArtifactId: value.targetArtifactId,
    signal: value.signal,
    reason: value.reason
  };
}

function parseRejectedUpdateDetails(value: unknown): BrainRejectedUpdateDetails {
  if (!isRecord(value)
    || typeof value.targetArtifactId !== "string"
    || typeof value.rejectedAt !== "string"
    || typeof value.reason !== "string"
    || typeof value.retryable !== "boolean") {
    throw new BrainStorageCorruptionError("Brain rejected update details are malformed");
  }
  return {
    kind: "rejected-update",
    targetArtifactId: value.targetArtifactId,
    rejectedAt: value.rejectedAt,
    reason: value.reason,
    retryable: value.retryable
  };
}

function detailKindAllowed(type: BrainArtifactType, kind: BrainArtifactDetails["kind"]): boolean {
  if (type === "bounded-episode") return kind === "episode";
  if (type === "workflow") return kind === "workflow";
  if (type === "feedback") return kind === "feedback";
  if (type === "rejected-update") return kind === "rejected-update";
  if (type === "fact" || type === "claim" || type === "entity" || type === "concept" || type === "decision" || type === "project") {
    return kind === "none" || kind === "knowledge";
  }
  return kind === "none";
}

function isKnowledgeStatus(value: unknown): value is BrainKnowledgeDetails["status"] {
  return value === "draft" || value === "accepted" || value === "disputed" || value === "superseded";
}

function isEpisodeOutcome(value: unknown): value is BrainEpisodeDetails["outcome"] {
  return value === "success" || value === "failure" || value === "partial" || value === "cancelled";
}

function isFeedbackSignal(value: unknown): value is BrainFeedbackDetails["signal"] {
  return value === "positive" || value === "negative" || value === "correction";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalStringMalformed(value: unknown): boolean {
  return value !== undefined && typeof value !== "string";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
