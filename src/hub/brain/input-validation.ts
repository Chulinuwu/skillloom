import { BrainValidationError } from "./errors.js";
import type { CaptureBrainInput, LinkBrainInput, UpdateBrainInput } from "./types.js";
import {
  parseBrainArtifactDetails,
} from "./artifact-details.js";
import {
  isBrainArtifactType,
  isBrainArtifactLayer,
  isBrainSensitivity,
  parseBrainArtifact,
  validateActor,
  validateArtifactId,
  validateBrainJsonRecord,
  validateContent,
  validateRelationship,
  validateRequestId,
  validateRevision,
  validateTitle
} from "./validation.js";
import { defaultBrainLayer } from "./vocabulary.js";

export function validateCaptureInput(input: CaptureBrainInput): void {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  if (!isBrainArtifactType(input.type)) {
    throw new BrainValidationError("type is not a supported brain artifact type");
  }
  if (!isBrainSensitivity(input.sensitivity)) {
    throw new BrainValidationError("sensitivity is not supported");
  }
  if (input.layer !== undefined && !isBrainArtifactLayer(input.layer)) {
    throw new BrainValidationError("layer is not a supported brain artifact layer");
  }
  validateTitle(input.title);
  validateContent(input.content);
  validateBrainJsonRecord(input.frontmatter ?? {}, "frontmatter");
  validateBrainJsonRecord(input.provenance, "provenance");
  validateTypedMetadata({
    id: "00000000-0000-0000-0000-000000000000",
    type: input.type,
    layer: input.layer ?? defaultBrainLayer(input.type),
    path: "vault/inbox/00000000-0000-0000-0000-000000000000.md",
    revision: "1",
    contentHash: "sha256:0",
    title: input.title,
    content: input.content,
    frontmatter: input.frontmatter ?? {},
    provenance: input.provenance,
    ...(input.source === undefined ? {} : { source: input.source }),
    details: input.details ?? { kind: "none" },
    sensitivity: input.sensitivity,
    createdAt: new Date(0).toISOString(),
    createdBy: input.actor.actorId,
    updatedAt: new Date(0).toISOString(),
    updatedBy: input.actor.actorId
  });
}

export function validateUpdateInput(input: UpdateBrainInput): void {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  validateArtifactId(input.artifactId);
  validateRevision(input.baseRevision, "baseRevision");
  if (input.type !== undefined && !isBrainArtifactType(input.type)) {
    throw new BrainValidationError("type is not a supported brain artifact type");
  }
  if (input.sensitivity !== undefined && !isBrainSensitivity(input.sensitivity)) {
    throw new BrainValidationError("sensitivity is not supported");
  }
  if (input.layer !== undefined && !isBrainArtifactLayer(input.layer)) {
    throw new BrainValidationError("layer is not a supported brain artifact layer");
  }
  if (input.title !== undefined) {
    validateTitle(input.title);
  }
  if (input.content !== undefined) {
    validateContent(input.content);
  }
  if (input.frontmatter !== undefined) {
    validateBrainJsonRecord(input.frontmatter, "frontmatter");
  }
  if (input.provenance !== undefined) {
    validateBrainJsonRecord(input.provenance, "provenance");
  }
  if (input.details !== undefined) {
    validateDetailsShape(input.details);
  }
}

export function validateLinkInput(input: LinkBrainInput): void {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  validateArtifactId(input.sourceArtifactId);
  validateArtifactId(input.targetArtifactId);
  validateRelationship(input.relationship);
}

function validateTypedMetadata(artifact: Parameters<typeof parseBrainArtifact>[0]): void {
  try {
    parseBrainArtifact(artifact);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}

function validateDetailsShape(details: UpdateBrainInput["details"]): void {
  try {
    parseBrainArtifactDetails(details);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}
