import { BrainStorageCorruptionError, BrainValidationError } from "./errors.js";
import type {
  BrainActor,
  BrainArtifact,
  BrainArtifactDetails,
  BrainArtifactLayer,
  BrainArtifactMetadata,
  BrainArtifactType,
  BrainAuditEvent,
  BrainJsonValue,
  BrainLink,
  BrainMutationResult,
  BrainPendingOperation,
  BrainSensitivity
} from "./types.js";
import {
  parseBrainArtifactDetails,
  parseBrainArtifactLayer,
  parseBrainSourceMetadata,
  validateBrainArtifactConsistency
} from "./artifact-details.js";
import { brainArtifactLayers, brainArtifactTypes, brainRelationshipTypes, defaultBrainLayer } from "./vocabulary.js";

const artifactTypes: ReadonlySet<string> = new Set(brainArtifactTypes);
const artifactLayers: ReadonlySet<string> = new Set(brainArtifactLayers);
const relationshipTypes: ReadonlySet<string> = new Set(brainRelationshipTypes);
const sensitivities: ReadonlySet<string> = new Set(["private", "tailnet", "restricted"]);
const decimalPattern = /^(0|[1-9]\d*)$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const relationshipPattern = /^[a-z][a-z0-9-]{0,63}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const noneDetails: BrainArtifactDetails = { kind: "none" };

export function validateActor(actor: BrainActor): void {
  validateIdentifier(actor.actorId, "actorId");
}

export function validateRequestId(requestId: string): void {
  validateIdentifier(requestId, "requestId");
}

export function validateArtifactId(artifactId: string): void {
  if (!uuidPattern.test(artifactId)) {
    throw new BrainValidationError("artifactId must be a canonical lowercase UUID");
  }
}

export function validateRevision(revision: string, field = "revision"): void {
  if (!decimalPattern.test(revision) || BigInt(revision) < 1n) {
    throw new BrainValidationError(`${field} must be a positive decimal string`);
  }
}

export function validateTitle(title: string): void {
  if (title.trim().length === 0 || title.length > 500) {
    throw new BrainValidationError("title must contain 1 to 500 characters");
  }
}

export function validateContent(content: string): void {
  if (content.length > 2_000_000) {
    throw new BrainValidationError("content exceeds the 2000000 character limit");
  }
}

export function validateRelationship(relationship: string): void {
  if (!relationshipTypes.has(relationship) && !relationshipPattern.test(relationship)) {
    throw new BrainValidationError("relationship must be a lowercase typed relationship");
  }
}

export function validateSearchQuery(query: string): void {
  if (query.trim().length === 0 || query.length > 500) {
    throw new BrainValidationError("search query must contain 1 to 500 characters");
  }
}

export function isBrainArtifactType(value: unknown): value is BrainArtifactType {
  return typeof value === "string" && artifactTypes.has(value);
}

export function isBrainSensitivity(value: unknown): value is BrainSensitivity {
  return typeof value === "string" && sensitivities.has(value);
}

export function isBrainArtifactLayer(value: unknown): value is BrainArtifactLayer {
  return typeof value === "string" && artifactLayers.has(value);
}

export function validateBrainJsonRecord(value: unknown, field: string): asserts value is Record<string, BrainJsonValue> {
  if (!isJsonRecord(value)) {
    throw new BrainValidationError(`${field} must contain only JSON values`);
  }
}

export function parseBrainArtifact(value: unknown): BrainArtifact {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !isBrainArtifactType(value.type)
    || typeof value.path !== "string"
    || typeof value.revision !== "string"
    || typeof value.contentHash !== "string"
    || typeof value.title !== "string"
    || typeof value.content !== "string"
    || !isJsonRecord(value.frontmatter)
    || !isJsonRecord(value.provenance)
    || !isBrainSensitivity(value.sensitivity)
    || typeof value.createdAt !== "string"
    || typeof value.createdBy !== "string"
    || typeof value.updatedAt !== "string"
    || typeof value.updatedBy !== "string") {
    throw new BrainStorageCorruptionError("Brain artifact metadata is malformed");
  }
  const type = value.type;
  const layer = value.layer === undefined ? defaultBrainLayer(type) : parseBrainArtifactLayer(value.layer);
  const details = value.details === undefined ? noneDetails : parseBrainArtifactDetails(value.details);
  validateBrainArtifactConsistency(type, layer, details);
  return {
    id: value.id,
    type,
    layer,
    path: value.path,
    revision: value.revision,
    contentHash: value.contentHash,
    title: value.title,
    content: value.content,
    frontmatter: value.frontmatter,
    provenance: value.provenance,
    ...(value.source === undefined ? {} : { source: parseBrainSourceMetadata(value.source) }),
    details,
    sensitivity: value.sensitivity,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy
  };
}

export function parseBrainArtifactMetadata(value: unknown): BrainArtifactMetadata {
  return withoutContent(parseBrainArtifact({ ...recordOrThrow(value), content: "" }));
}

export function parseBrainMutationResult(value: unknown): BrainMutationResult {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.eventSequence !== "string") {
    throw new BrainStorageCorruptionError("Brain mutation result is malformed");
  }
  if (value.kind === "artifact") {
    return { kind: "artifact", artifact: parseBrainArtifactMetadata(value.artifact), eventSequence: value.eventSequence };
  }
  if (value.kind === "link") {
    return { kind: "link", link: parseBrainLink(value.link), eventSequence: value.eventSequence };
  }
  throw new BrainStorageCorruptionError("Brain mutation result kind is malformed");
}

export function parseBrainAuditEvent(value: unknown): BrainAuditEvent {
  if (!isRecord(value)
    || typeof value.sequence !== "string"
    || !decimalPattern.test(value.sequence)
    || typeof value.eventId !== "string"
    || !isAuditKind(value.kind)
    || !isRecord(value.actor)
    || typeof value.actor.actorId !== "string"
    || !isRecord(value.resource)
    || !isResourceKind(value.resource.kind)
    || typeof value.resource.id !== "string"
    || typeof value.requestId !== "string"
    || typeof value.payloadHash !== "string"
    || typeof value.createdAt !== "string") {
    throw new BrainStorageCorruptionError("Brain audit event is malformed");
  }
  return {
    sequence: value.sequence,
    eventId: value.eventId,
    kind: value.kind,
    actor: { actorId: value.actor.actorId },
    resource: {
      kind: value.resource.kind,
      id: value.resource.id,
      ...(typeof value.resource.revision === "string" ? { revision: value.resource.revision } : {})
    },
    requestId: value.requestId,
    payloadHash: value.payloadHash,
    result: parseBrainMutationResult(value.result),
    createdAt: value.createdAt
  };
}

export function parseBrainPendingOperation(value: unknown): BrainPendingOperation {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.operationId !== "string"
    || !isAction(value.action)
    || !isRecord(value.actor)
    || typeof value.actor.actorId !== "string"
    || typeof value.requestId !== "string"
    || typeof value.payloadHash !== "string"
    || !isRecord(value.event)
    || typeof value.createdAt !== "string") {
    throw new BrainStorageCorruptionError("Pending brain operation is malformed");
  }
  const event = parseAuditDraft(value.event);
  if (value.action === "link") {
    return {
      version: 1,
      operationId: value.operationId,
      action: "link",
      actor: { actorId: value.actor.actorId },
      requestId: value.requestId,
      payloadHash: value.payloadHash,
      link: parseBrainLink(value.link),
      event,
      createdAt: value.createdAt
    };
  }
  return {
    version: 1,
    operationId: value.operationId,
    action: value.action,
    actor: { actorId: value.actor.actorId },
    requestId: value.requestId,
    payloadHash: value.payloadHash,
    artifact: parseBrainArtifact(value.artifact),
    ...(parseArtifactBase(value.base) ? { base: parseArtifactBase(value.base) } : {}),
    event,
    createdAt: value.createdAt
  };
}

function parseArtifactBase(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || typeof value.revision !== "string" || typeof value.contentHash !== "string") {
    throw new BrainStorageCorruptionError("Pending brain base revision is malformed");
  }
  return { revision: value.revision, contentHash: value.contentHash };
}

export function withoutContent(artifact: BrainArtifact): BrainArtifactMetadata {
  return {
    id: artifact.id,
    type: artifact.type,
    layer: artifact.layer,
    path: artifact.path,
    revision: artifact.revision,
    contentHash: artifact.contentHash,
    title: artifact.title,
    frontmatter: artifact.frontmatter,
    provenance: artifact.provenance,
    ...(artifact.source === undefined ? {} : { source: artifact.source }),
    details: artifact.details,
    sensitivity: artifact.sensitivity,
    createdAt: artifact.createdAt,
    createdBy: artifact.createdBy,
    updatedAt: artifact.updatedAt,
    updatedBy: artifact.updatedBy
  };
}

function parseBrainLink(value: unknown): BrainLink {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.sourceArtifactId !== "string"
    || typeof value.targetArtifactId !== "string"
    || typeof value.relationship !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.createdBy !== "string") {
    throw new BrainStorageCorruptionError("Brain link is malformed");
  }
  validateRelationship(value.relationship);
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}

function parseAuditDraft(value: Record<string, unknown>) {
  const parsed = parseBrainAuditEvent({ ...value, sequence: "1", result: draftResult(value) });
  return {
    eventId: parsed.eventId,
    kind: parsed.kind,
    actor: parsed.actor,
    resource: parsed.resource,
    requestId: parsed.requestId,
    payloadHash: parsed.payloadHash,
    createdAt: parsed.createdAt
  };
}

function draftResult(value: Record<string, unknown>): BrainMutationResult {
  const resource = isRecord(value.resource) ? value.resource : {};
  if (resource.kind === "brain-link") {
    return {
      kind: "link",
      link: {
        id: "00000000-0000-0000-0000-000000000000",
        sourceArtifactId: "00000000-0000-0000-0000-000000000000",
        targetArtifactId: "00000000-0000-0000-0000-000000000000",
        relationship: "related-to",
        createdAt: new Date(0).toISOString(),
        createdBy: "system"
      },
      eventSequence: "1"
    };
  }
  return {
    kind: "artifact",
    artifact: {
      id: "00000000-0000-0000-0000-000000000000",
      type: "note",
      layer: "human-knowledge",
      path: "vault/inbox/00000000-0000-0000-0000-000000000000.md",
      revision: "1",
      contentHash: "sha256:0",
      title: "pending",
      frontmatter: {},
      provenance: {},
      details: { kind: "none" },
      sensitivity: "private",
      createdAt: new Date(0).toISOString(),
      createdBy: "system",
      updatedAt: new Date(0).toISOString(),
      updatedBy: "system"
    },
    eventSequence: "1"
  };
}

function validateIdentifier(value: string, field: string): void {
  if (!identifierPattern.test(value)) {
    throw new BrainValidationError(`${field} contains unsupported characters or length`);
  }
}

function isAction(value: unknown): value is "capture" | "update" | "link" {
  return value === "capture" || value === "update" || value === "link";
}

function isAuditKind(value: unknown): value is BrainAuditEvent["kind"] {
  return value === "brain.captured" || value === "brain.updated" || value === "brain.linked";
}

function isResourceKind(value: unknown): value is BrainAuditEvent["resource"]["kind"] {
  return value === "brain-artifact" || value === "brain-link";
}

function isJsonRecord(value: unknown): value is Record<string, BrainJsonValue> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is BrainJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordOrThrow(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BrainStorageCorruptionError("Expected a JSON object");
  }
  return value;
}
