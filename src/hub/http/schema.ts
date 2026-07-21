import { isBrainArtifactType, isBrainSensitivity, isCanonicalUuid, isJsonRecord, isRecord, unknownKeys } from "../adapter-schema.js";
import type { CaptureBrainInput, LinkBrainInput, SearchBrainInput, UpdateBrainInput } from "../brain/index.js";
import { BrainHttpError } from "./errors.js";
import type { BrainHttpRequest } from "./types.js";

const maximumBodyBytes = 2_250_000;

export type ParsedCaptureBody = Omit<CaptureBrainInput, "actor" | "requestId">;
export type ParsedUpdateBody = Omit<UpdateBrainInput, "actor" | "requestId" | "artifactId">;
export type ParsedLinkBody = Pick<LinkBrainInput, "targetArtifactId" | "relationship">;
export type ParsedSearchBody = Omit<SearchBrainInput, "actor">;

export function parseCaptureBody(request: BrainHttpRequest): ParsedCaptureBody {
  const input = strictObject(parseJsonBody(request), ["type", "title", "content", "frontmatter", "provenance", "sensitivity"]);
  if (!isBrainArtifactType(input.type) || typeof input.title !== "string" || typeof input.content !== "string"
    || !isJsonRecord(input.provenance) || !isBrainSensitivity(input.sensitivity)
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))) {
    throw validationError("Capture body has invalid field types");
  }
  return {
    type: input.type,
    title: input.title,
    content: input.content,
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    provenance: input.provenance,
    sensitivity: input.sensitivity
  };
}

export function parseUpdateBody(request: BrainHttpRequest): ParsedUpdateBody {
  const input = strictObject(parseJsonBody(request), ["baseRevision", "type", "title", "content", "frontmatter", "provenance", "sensitivity"]);
  if (typeof input.baseRevision !== "string"
    || (input.type !== undefined && !isBrainArtifactType(input.type))
    || (input.title !== undefined && typeof input.title !== "string")
    || (input.content !== undefined && typeof input.content !== "string")
    || (input.frontmatter !== undefined && !isJsonRecord(input.frontmatter))
    || (input.provenance !== undefined && !isJsonRecord(input.provenance))
    || (input.sensitivity !== undefined && !isBrainSensitivity(input.sensitivity))) {
    throw validationError("Update body has invalid field types");
  }
  return {
    baseRevision: input.baseRevision,
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.content === undefined ? {} : { content: input.content }),
    ...(input.frontmatter === undefined ? {} : { frontmatter: input.frontmatter }),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
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
