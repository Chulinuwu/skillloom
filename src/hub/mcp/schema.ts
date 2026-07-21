import { isBrainArtifactType, isBrainSensitivity, isCanonicalUuid, isJsonRecord, isRecord, unknownKeys } from "../adapter-schema.js";
import type { CaptureBrainInput, LinkBrainInput, SearchBrainInput, UpdateBrainInput } from "../brain/index.js";
import type { SkillCapability } from "../../domain/types.js";
import type { RegistryProvenanceReference } from "../registry/index.js";
import { BrainMcpError } from "./errors.js";

export type BrainMcpCaptureInput = Omit<CaptureBrainInput, "actor">;
export type BrainMcpUpdateInput = Omit<UpdateBrainInput, "actor">;
export type BrainMcpLinkInput = Omit<LinkBrainInput, "actor">;
export type BrainMcpSearchInput = Omit<SearchBrainInput, "actor">;
export type RegistryMcpFileInput = Readonly<{ relativePath: string; mode: 0o644 | 0o755; content: string }>;
export type RegistryMcpProposeInput = Readonly<{
  requestId: string;
  name: string;
  baseReleaseHash: string | null;
  capabilities: readonly SkillCapability[];
  provenance: readonly RegistryProvenanceReference[];
  files: readonly RegistryMcpFileInput[];
}>;
export type RegistryMcpPublishInput = Readonly<{ requestId: string; candidateId: string; version: string; channel: "stable" }>;

export function parseBrainMcpSearch(value: unknown): BrainMcpSearchInput {
  const input = strictObject(value, ["query", "type", "limit"]);
  if (typeof input.query !== "string"
    || (input.type !== undefined && !isBrainArtifactType(input.type))
    || (input.limit !== undefined && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50))) {
    throw validationError("brain_search arguments have invalid field types");
  }
  return {
    query: input.query,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  };
}

export function parseBrainMcpRead(value: unknown): { artifactId: string } {
  const input = strictObject(value, ["artifactId"]);
  return { artifactId: uuid(input.artifactId, "artifactId") };
}

export function parseBrainMcpCapture(value: unknown): BrainMcpCaptureInput {
  const input = strictObject(value, ["requestId", "type", "title", "content", "frontmatter", "provenance", "sensitivity"]);
  if (!isBrainArtifactType(input.type) || typeof input.title !== "string" || typeof input.content !== "string"
    || !isJsonRecord(input.provenance) || !isBrainSensitivity(input.sensitivity)
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))) {
    throw validationError("brain_capture arguments have invalid field types");
  }
  return {
    requestId: uuid(input.requestId, "requestId"),
    type: input.type,
    title: input.title,
    content: input.content,
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    provenance: input.provenance,
    sensitivity: input.sensitivity
  };
}

export function parseBrainMcpUpdate(value: unknown): BrainMcpUpdateInput {
  const input = strictObject(value, ["requestId", "artifactId", "baseRevision", "type", "title", "content", "frontmatter", "provenance", "sensitivity"]);
  if (typeof input.baseRevision !== "string"
    || (input.type !== undefined && !isBrainArtifactType(input.type))
    || (input.title !== undefined && typeof input.title !== "string")
    || (input.content !== undefined && typeof input.content !== "string")
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))
    || (input.provenance !== undefined && !isJsonRecord(input.provenance))
    || (input.sensitivity !== undefined && !isBrainSensitivity(input.sensitivity))) {
    throw validationError("brain_update arguments have invalid field types");
  }
  return {
    requestId: uuid(input.requestId, "requestId"),
    artifactId: uuid(input.artifactId, "artifactId"),
    baseRevision: input.baseRevision,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.content === undefined ? {} : { content: input.content }),
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    ...(input.sensitivity === undefined ? {} : { sensitivity: input.sensitivity })
  };
}

export function parseBrainMcpLink(value: unknown): BrainMcpLinkInput {
  const input = strictObject(value, ["requestId", "sourceArtifactId", "targetArtifactId", "relationship"]);
  if (typeof input.relationship !== "string") throw validationError("brain_link arguments have invalid field types");
  return {
    requestId: uuid(input.requestId, "requestId"),
    sourceArtifactId: uuid(input.sourceArtifactId, "sourceArtifactId"),
    targetArtifactId: uuid(input.targetArtifactId, "targetArtifactId"),
    relationship: input.relationship
  };
}
export function parseRegistryMcpPropose(value: unknown): RegistryMcpProposeInput {
  const input = strictObject(value, ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files"]);
  return {
    requestId: uuid(input.requestId, "requestId"),
    name: text(input.name, "name"),
    baseReleaseHash: nullablePackageHash(input.baseReleaseHash, "baseReleaseHash"),
    capabilities: capabilities(input.capabilities),
    provenance: provenance(input.provenance),
    files: files(input.files)
  };
}
export function parseRegistryMcpPublish(value: unknown): RegistryMcpPublishInput {
  const input = strictObject(value, ["requestId", "candidateId", "version", "channel"]);
  if (input.channel !== "stable") throw validationError("skill_publish channel must be stable");
  return {
    requestId: uuid(input.requestId, "requestId"),
    candidateId: text(input.candidateId, "candidateId"),
    version: semanticVersion(input.version),
    channel: "stable"
  };
}

function strictObject(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw validationError("Tool arguments must be an object");
  const unknown = unknownKeys(value, allowedKeys);
  if (unknown.length > 0) throw validationError(`Unknown tool arguments: ${unknown.sort().join(", ")}`);
  return value;
}

function uuid(value: unknown, field: string): string {
  if (!isCanonicalUuid(value)) throw validationError(`${field} must be a canonical lowercase UUID`);
  return value;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw validationError(`${field} must be canonical non-empty text`);
  }
  return value;
}
function nullablePackageHash(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw validationError(`${field} must be a sha256-v2 package hash or null`);
  return value;
}
function capabilities(value: unknown): SkillCapability[] {
  const allowed = new Set<SkillCapability>(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item): item is SkillCapability => typeof item === "string" && allowed.has(item as SkillCapability))) {
    throw validationError("capabilities contains an invalid capability");
  }
  if (new Set(value).size !== value.length) throw validationError("capabilities contains a duplicate value");
  return [...value];
}
function provenance(value: unknown): RegistryProvenanceReference[] {
  if (!Array.isArray(value)) throw validationError("provenance must be an array");
  return value.map((item, index) => {
    const record = strictObject(item, ["artifactId", "revision", "contentHash"]);
    return {
      artifactId: text(record.artifactId, `provenance[${index}].artifactId`),
      revision: sequence(record.revision, `provenance[${index}].revision`),
      contentHash: digest(record.contentHash, `provenance[${index}].contentHash`)
    };
  });
}
function files(value: unknown): RegistryMcpFileInput[] {
  if (!Array.isArray(value)) throw validationError("files must be an array");
  return value.map((item, index) => {
    const record = strictObject(item, ["relativePath", "mode", "content"]);
    if (record.mode !== 0o644 && record.mode !== 0o755) throw validationError(`files[${index}].mode must be 0644 or 0755`);
    return { relativePath: text(record.relativePath, `files[${index}].relativePath`), mode: record.mode, content: text(record.content, `files[${index}].content`) };
  });
}
function sequence(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw validationError(`${field} must be a canonical nonnegative decimal sequence`);
  return value;
}
function digest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw validationError(`${field} must be a SHA-256 digest`);
  return value;
}
function semanticVersion(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
    throw validationError("version must be a canonical semantic version");
  }
  return value;
}

function validationError(message: string): BrainMcpError {
  return new BrainMcpError("BRAIN_MCP_VALIDATION_ERROR", message);
}
