import type { AuthoringDocumentFrontmatter, ParsedAuthoringDocument } from "./authoring-types.js";
import type { BrainArtifact, BrainJsonValue } from "./types.js";
import {
  isBrainArtifactType,
  isBrainSensitivity,
  validateArtifactId,
  validateContent,
  validateRevision,
  validateTitle
} from "./validation.js";

export function serializeAuthoringDocument(frontmatter: AuthoringDocumentFrontmatter, content: string): string {
  return `---\n${JSON.stringify(frontmatter)}\n---\n${content}`;
}

export function serializeCuratedArtifact(artifact: BrainArtifact): string {
  return serializeAuthoringDocument({
    skillloomAuthoring: true,
    canonicalArtifactId: artifact.id,
    baseRevision: artifact.revision,
    title: artifact.title,
    type: artifact.type,
    sensitivity: artifact.sensitivity,
    frontmatter: artifact.frontmatter
  }, artifact.content);
}

export function parseAuthoringDocument(text: string, fallbackStagedAt: string): ParsedAuthoringDocument {
  if (!text.startsWith("---\n")) {
    return { frontmatter: { stagedAt: fallbackStagedAt }, content: text, errors: [] };
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: { stagedAt: fallbackStagedAt }, content: text, errors: ["unterminated frontmatter"] };
  }
  const parsed = parseFrontmatter(text.slice(4, end));
  return {
    frontmatter: {
      ...parsed.frontmatter,
      stagedAt: parsed.frontmatter.stagedAt ?? fallbackStagedAt
    },
    content: text.slice(end + 5),
    errors: parsed.errors
  };
}

export function authoringDocumentErrors(frontmatter: AuthoringDocumentFrontmatter): string[] {
  const hasTarget = frontmatter.canonicalArtifactId !== undefined;
  const hasBase = frontmatter.baseRevision !== undefined;
  return hasTarget === hasBase ? [] : ["canonicalArtifactId and baseRevision must be provided together"];
}

export function authoringPayloadErrors(document: ParsedAuthoringDocument): string[] {
  const errors: string[] = [];
  if (document.frontmatter.title !== undefined && !isValid(() => validateTitle(document.frontmatter.title ?? ""))) {
    errors.push("title is invalid");
  }
  if (!isValid(() => validateContent(document.content))) errors.push("content is too large");
  if (document.frontmatter.canonicalArtifactId !== undefined
    && !isValid(() => validateArtifactId(document.frontmatter.canonicalArtifactId ?? ""))) {
    errors.push("canonicalArtifactId is invalid");
  }
  if (document.frontmatter.baseRevision !== undefined
    && !isValid(() => validateRevision(document.frontmatter.baseRevision ?? "", "baseRevision"))) {
    errors.push("baseRevision is invalid");
  }
  return errors;
}

function parseFrontmatter(text: string): { frontmatter: AuthoringDocumentFrontmatter; errors: string[] } {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? normalizeFrontmatter(value) : { frontmatter: {}, errors: ["frontmatter is not an object"] };
  } catch {
    return { frontmatter: {}, errors: ["frontmatter is not valid JSON"] };
  }
}

function normalizeFrontmatter(value: Record<string, unknown>): { frontmatter: AuthoringDocumentFrontmatter; errors: string[] } {
  const canonicalArtifactId = normalizedCanonicalArtifactId(value);
  return {
    frontmatter: {
      ...(typeof value.skillloomAuthoring === "boolean" ? { skillloomAuthoring: value.skillloomAuthoring } : {}),
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      ...(isBrainArtifactType(value.type) ? { type: value.type } : {}),
      ...(isBrainSensitivity(value.sensitivity) ? { sensitivity: value.sensitivity } : {}),
      ...(canonicalArtifactId === undefined ? {} : { canonicalArtifactId }),
      ...(typeof value.baseRevision === "string" ? { baseRevision: value.baseRevision } : {}),
      ...(isJsonRecord(value.provenance) ? { provenance: value.provenance } : {}),
      ...(isJsonRecord(value.frontmatter) ? { frontmatter: value.frontmatter } : {}),
      ...(typeof value.stagedAt === "string" ? { stagedAt: value.stagedAt } : {})
    },
    errors: invalidFrontmatterFields(value)
  };
}

function normalizedCanonicalArtifactId(value: Record<string, unknown>): string | undefined {
  if (typeof value.canonicalArtifactId === "string") return value.canonicalArtifactId;
  if (typeof value.targetArtifactId === "string") return value.targetArtifactId;
  return undefined;
}

function invalidFrontmatterFields(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (value.skillloomAuthoring !== undefined && typeof value.skillloomAuthoring !== "boolean") errors.push("skillloomAuthoring must be a boolean");
  if (value.title !== undefined && typeof value.title !== "string") errors.push("title must be a string");
  if (value.type !== undefined && !isBrainArtifactType(value.type)) errors.push("type is not supported");
  if (value.sensitivity !== undefined && !isBrainSensitivity(value.sensitivity)) errors.push("sensitivity is not supported");
  if (value.canonicalArtifactId !== undefined && typeof value.canonicalArtifactId !== "string") errors.push("canonicalArtifactId must be a string");
  if (value.targetArtifactId !== undefined && typeof value.targetArtifactId !== "string") errors.push("targetArtifactId must be a string");
  if (typeof value.canonicalArtifactId === "string" && typeof value.targetArtifactId === "string" && value.canonicalArtifactId !== value.targetArtifactId) {
    errors.push("canonicalArtifactId and targetArtifactId disagree");
  }
  if (value.baseRevision !== undefined && typeof value.baseRevision !== "string") errors.push("baseRevision must be a string");
  if (value.provenance !== undefined && !isJsonRecord(value.provenance)) errors.push("provenance must be JSON");
  if (value.frontmatter !== undefined && !isJsonRecord(value.frontmatter)) errors.push("frontmatter must be JSON");
  if (value.stagedAt !== undefined && typeof value.stagedAt !== "string") errors.push("stagedAt must be a string");
  return errors;
}

function isJsonRecord(value: unknown): value is Record<string, BrainJsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is BrainJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValid(validate: () => void): boolean {
  try {
    validate();
    return true;
  } catch {
    return false;
  }
}
