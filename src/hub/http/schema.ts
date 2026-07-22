import { isBrainArtifactLayer, isBrainArtifactType, isBrainSensitivity, isCanonicalUuid, isJsonRecord, isRecord, unknownKeys } from "../adapter-schema.js";
import { parseBrainArtifactDetails, parseBrainSourceMetadata } from "../brain/artifact-details.js";
import type { CaptureBrainInput, LinkBrainInput, RetrieveBrainInput, SearchBrainInput, UpdateBrainInput } from "../brain/index.js";
import { BrainHttpError } from "./errors.js";
import type { BrainHttpRequest } from "./types.js";

const maximumBodyBytes = 2_250_000;

export type ParsedCaptureBody = Omit<CaptureBrainInput, "actor" | "requestId">;
export type ParsedUpdateBody = Omit<UpdateBrainInput, "actor" | "requestId" | "artifactId">;
export type ParsedLinkBody = Pick<LinkBrainInput, "targetArtifactId" | "relationship">;
export type ParsedSearchBody = Omit<SearchBrainInput, "actor">;
export type ParsedRetrieveBody = Omit<RetrieveBrainInput, "actor">;

export function parseCaptureBody(request: BrainHttpRequest): ParsedCaptureBody {
  const input = strictObject(parseJsonBody(request), ["type", "layer", "title", "content", "frontmatter", "provenance", "source", "details", "sensitivity"]);
  if (!isBrainArtifactType(input.type) || typeof input.title !== "string" || typeof input.content !== "string"
    || !isJsonRecord(input.provenance) || !isBrainSensitivity(input.sensitivity)
    || (input.layer !== undefined && !isBrainArtifactLayer(input.layer))
    || (input.source !== undefined && !isJsonRecord(input.source))
    || (input.details !== undefined && !isJsonRecord(input.details))
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))) {
    throw validationError("Capture body has invalid field types");
  }
  return {
    type: input.type,
    ...(input.layer === undefined ? {} : { layer: input.layer }),
    title: input.title,
    content: input.content,
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    provenance: input.provenance,
    ...(input.source === undefined ? {} : { source: parseSourceInput(input.source) }),
    ...(input.details === undefined ? {} : { details: parseDetailsInput(input.details) }),
    sensitivity: input.sensitivity
  };
}

export function parseUpdateBody(request: BrainHttpRequest): ParsedUpdateBody {
  const input = strictObject(parseJsonBody(request), ["baseRevision", "type", "layer", "title", "content", "frontmatter", "provenance", "details", "sensitivity"]);
  if (typeof input.baseRevision !== "string"
    || (input.type !== undefined && !isBrainArtifactType(input.type))
    || (input.layer !== undefined && !isBrainArtifactLayer(input.layer))
    || (input.title !== undefined && typeof input.title !== "string")
    || (input.content !== undefined && typeof input.content !== "string")
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))
    || (input.provenance !== undefined && !isJsonRecord(input.provenance))
    || (input.details !== undefined && !isJsonRecord(input.details))
    || (input.sensitivity !== undefined && !isBrainSensitivity(input.sensitivity))) {
    throw validationError("Update body has invalid field types");
  }
  return {
    baseRevision: input.baseRevision,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.layer === undefined ? {} : { layer: input.layer }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.content === undefined ? {} : { content: input.content }),
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    ...(input.details === undefined ? {} : { details: parseDetailsInput(input.details) }),
    ...(input.sensitivity === undefined ? {} : { sensitivity: input.sensitivity })
  };
}

export function parseLinkBody(request: BrainHttpRequest): ParsedLinkBody {
  const input = strictObject(parseJsonBody(request), ["targetArtifactId", "relationship"]);
  if (!isCanonicalUuid(input.targetArtifactId) || typeof input.relationship !== "string") {
    throw validationError("Link body has invalid field types");
  }
  return { targetArtifactId: input.targetArtifactId, relationship: input.relationship };
}

export function parseSearchBody(request: BrainHttpRequest): ParsedSearchBody {
  const input = strictObject(parseJsonBody(request), ["query", "type", "limit"]);
  if (typeof input.query !== "string"
    || (input.type !== undefined && !isBrainArtifactType(input.type))
    || (input.limit !== undefined && (!Number.isInteger(input.limit) || typeof input.limit !== "number" || input.limit < 1 || input.limit > 50))) {
    throw validationError("Search body has invalid field types");
  }
  return {
    query: input.query,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.limit === undefined ? {} : { limit: input.limit })
  };
}
export function parseRetrieveBody(request: BrainHttpRequest): ParsedRetrieveBody {
  const input = strictObject(parseJsonBody(request), ["query", "tier", "limit", "filters"]);
  if (typeof input.query !== "string"
    || (input.tier !== undefined && input.tier !== "quick" && input.tier !== "standard" && input.tier !== "deep")
    || (input.limit !== undefined && (!Number.isInteger(input.limit) || typeof input.limit !== "number" || input.limit < 1 || input.limit > 40))
    || (input.filters !== undefined && !isRecord(input.filters))) {
    throw validationError("Retrieve body has invalid field types");
  }
  return {
    query: input.query,
    ...(input.tier === undefined ? {} : { tier: input.tier }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.filters === undefined ? {} : { filters: parseRetrieveFilters(input.filters) })
  };
}

export function parseIdempotencyKey(request: BrainHttpRequest): string {
  const value = header(request, "idempotency-key");
  if (!isCanonicalUuid(value)) {
    throw validationError("Idempotency-Key must be a canonical lowercase UUID");
  }
  return value;
}

export function validateArtifactPathId(value: string): string {
  if (!isCanonicalUuid(value)) throw validationError("Artifact path ID must be a canonical lowercase UUID");
  return value;
}

export function assertBodyWithinLimit(body: Uint8Array | undefined): void {
  if ((body?.byteLength ?? 0) > maximumBodyBytes) {
    throw new BrainHttpError(413, "BRAIN_HTTP_BODY_TOO_LARGE", `JSON body exceeds ${maximumBodyBytes} bytes`);
  }
}

export function maximumBrainHttpBodyBytes(): number {
  return maximumBodyBytes;
}

function parseJsonBody(request: BrainHttpRequest): unknown {
  assertBodyWithinLimit(request.body);
  const contentType = header(request, "content-type");
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new BrainHttpError(415, "BRAIN_HTTP_UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  if (request.body === undefined || request.body.byteLength === 0) throw validationError("A JSON object body is required");
  try {
    return JSON.parse(Buffer.from(request.body).toString("utf8"));
  } catch {
    throw new BrainHttpError(400, "BRAIN_HTTP_INVALID_JSON", "Request body is not valid JSON");
  }
}

function strictObject(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw validationError("JSON body must be an object");
  const unknown = unknownKeys(value, allowedKeys);
  if (unknown.length > 0) throw validationError(`Unknown JSON fields: ${unknown.sort().join(", ")}`);
  return value;
}

function header(request: BrainHttpRequest, name: string): string | readonly string[] | undefined {
  const entry = Object.entries(request.headers).find(([key]) => key.toLowerCase() === name);
  if (!entry || Array.isArray(entry[1])) return entry?.[1];
  return entry[1];
}

function validationError(message: string): BrainHttpError {
  return new BrainHttpError(400, "BRAIN_HTTP_VALIDATION_ERROR", message);
}
function parseRetrieveFilters(value: Record<string, unknown>) {
  const input = strictObject(value, ["types", "layers", "sensitivities", "statuses", "updatedAfter", "updatedBefore", "hasSource"]);
  const types = optionalArray(input.types, isBrainArtifactType, "filters.types");
  const layers = optionalArray(input.layers, isBrainArtifactLayer, "filters.layers");
  const sensitivities = optionalArray(input.sensitivities, isBrainSensitivity, "filters.sensitivities");
  const statuses = optionalArray(input.statuses, isKnowledgeStatus, "filters.statuses");
  if ((input.updatedAfter !== undefined && typeof input.updatedAfter !== "string")
    || (input.updatedBefore !== undefined && typeof input.updatedBefore !== "string")
    || (input.hasSource !== undefined && typeof input.hasSource !== "boolean")) {
    throw validationError("Retrieve filters have invalid field types");
  }
  return {
    ...(types === undefined ? {} : { types }),
    ...(layers === undefined ? {} : { layers }),
    ...(sensitivities === undefined ? {} : { sensitivities }),
    ...(statuses === undefined ? {} : { statuses }),
    ...(input.updatedAfter === undefined ? {} : { updatedAfter: input.updatedAfter }),
    ...(input.updatedBefore === undefined ? {} : { updatedBefore: input.updatedBefore }),
    ...(input.hasSource === undefined ? {} : { hasSource: input.hasSource })
  };
}
function optionalArray<T>(value: unknown, validate: (item: unknown) => item is T, field: string): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(validate)) throw validationError(`${field} has invalid field types`);
  return [...new Set(value)];
}
function isKnowledgeStatus(value: unknown): value is "draft" | "accepted" | "disputed" | "superseded" {
  return value === "draft" || value === "accepted" || value === "disputed" || value === "superseded";
}

function parseSourceInput(value: unknown) {
  try {
    return parseBrainSourceMetadata(value);
  } catch {
    throw validationError("Source metadata has invalid field types");
  }
}

function parseDetailsInput(value: unknown) {
  try {
    return parseBrainArtifactDetails(value);
  } catch {
    throw validationError("Artifact details have invalid field types");
  }
}
