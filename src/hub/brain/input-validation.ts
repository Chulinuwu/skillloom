import { BrainValidationError } from "./errors.js";
import type { CaptureBrainInput, LinkBrainInput, UpdateBrainInput } from "./types.js";
import {
  isBrainArtifactType,
  isBrainSensitivity,
  validateActor,
  validateArtifactId,
  validateBrainJsonRecord,
  validateContent,
  validateRelationship,
  validateRequestId,
  validateRevision,
  validateTitle
} from "./validation.js";

export function validateCaptureInput(input: CaptureBrainInput): void {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  if (!isBrainArtifactType(input.type)) {
    throw new BrainValidationError("type is not a supported brain artifact type");
  }
  if (!isBrainSensitivity(input.sensitivity)) {
    throw new BrainValidationError("sensitivity is not supported");
  }
  validateTitle(input.title);
  validateContent(input.content);
  validateBrainJsonRecord(input.frontmatter ?? {}, "frontmatter");
  validateBrainJsonRecord(input.provenance, "provenance");
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
}

export function validateLinkInput(input: LinkBrainInput): void {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  validateArtifactId(input.sourceArtifactId);
  validateArtifactId(input.targetArtifactId);
  validateRelationship(input.relationship);
}
