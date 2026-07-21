import { MAX_TOTAL_BYTES } from "../../config/defaults.js";
import { isJsonRecord, isRecord, unknownKeys } from "../adapter-schema.js";
import type { SkillCapability } from "../../domain/types.js";
import { RegistryValidationError } from "./errors.js";
import { createPackageBlob, hashPackageBlob } from "./package-blob.js";
import { isCanonicalRegistrySequence } from "./schema.js";
import type { RegistryProvenanceReference } from "./types.js";
import type { ProposeRegistryInput, PublishRegistryInput, RegistryActor } from "./server-types.js";

export type RegistryReadRequest =
  | Readonly<{ kind: "manifest"; channel: string; afterSequence: string }>
  | Readonly<{ kind: "release"; releaseId: string }>
  | Readonly<{ kind: "blob"; packageHash: string }>;
export type RegistryHttpBodyRequest = Readonly<{
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  body?: Uint8Array;
}>;

export function parseRegistryReadPath(url: string): RegistryReadRequest {
  const parsed = parseUrl(url);
  const channel = parsed.pathname.match(/^\/v1\/registry\/channels\/([^/]+)$/);
  if (channel) {
    return {
      kind: "manifest",
      channel: identifier(decodeURIComponent(channel[1] ?? ""), "channel"),
      afterSequence: afterSequence(parsed)
    };
  }
  const release = parsed.pathname.match(/^\/v1\/registry\/releases\/([^/]+)$/);
  if (release) return { kind: "release", releaseId: identifier(decodeURIComponent(release[1] ?? ""), "releaseId") };
  const blob = parsed.pathname.match(/^\/v1\/registry\/blobs\/([^/]+)$/);
  if (blob) return { kind: "blob", packageHash: packageHash(decodeURIComponent(blob[1] ?? "")) };
  throw new RegistryValidationError("Registry route was not found");
}
export async function parseRegistryProposeBody(request: RegistryHttpBodyRequest, actor: RegistryActor): Promise<ProposeRegistryInput> {
  const input = strictBody(request, ["name", "baseReleaseHash", "capabilities", "provenance", "files"]);
  const files = array(input.files, "files").map((file, index) => parsePackageFile(file, index));
  const packageBlob = createPackageBlob(files);
  return {
    actor,
    requestId: parseIdempotencyKey(request),
    name: identifierField(input.name, "name"),
    packageBlob,
    claimedPackageHash: await hashPackageBlob(packageBlob),
    baseReleaseHash: nullablePackageHash(input.baseReleaseHash, "baseReleaseHash"),
    capabilities: parseCapabilities(input.capabilities),
    provenance: parseProvenance(input.provenance)
  };
}
export function parseRegistryPublishBody(request: RegistryHttpBodyRequest, actor: RegistryActor): PublishRegistryInput {
  const input = strictBody(request, ["candidateId", "version", "channel"]);
  if (input.channel !== "stable") throw new RegistryValidationError("channel must equal stable");
  return {
    actor,
    requestId: parseIdempotencyKey(request),
    candidateId: identifierField(input.candidateId, "candidateId"),
    version: semanticVersion(input.version),
    channel: "stable"
  };
}
export function parseRegistryIdempotencyKey(request: RegistryHttpBodyRequest): string {
  return parseIdempotencyKey(request);
}

function parseUrl(url: string): URL {
  try {
    return new URL(url, "http://loopback.invalid");
  } catch {
    throw new RegistryValidationError("Registry request URL is invalid");
  }
}

function afterSequence(url: URL): string {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== "afterSequence")) throw new RegistryValidationError("Registry query parameter is invalid");
  const value = url.searchParams.get("afterSequence") ?? "0";
  if (!isCanonicalRegistrySequence(value)) throw new RegistryValidationError("afterSequence must be a canonical nonnegative decimal sequence");
  return value;
}

function identifier(value: string, field: string): string {
  if (value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw new RegistryValidationError(`${field} must be a canonical non-empty string`);
  }
  return value;
}

function packageHash(value: string): string {
  if (!/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError("packageHash must be a sha256-v2 package hash");
  return value;
}
function strictBody(request: RegistryHttpBodyRequest, keys: readonly string[]): Record<string, unknown> {
  const input = parseJsonBody(request);
  if (!isRecord(input)) throw new RegistryValidationError("JSON body must be an object");
  const unknown = unknownKeys(input, keys);
  if (unknown.length > 0) throw new RegistryValidationError(`Unknown JSON fields: ${unknown.sort().join(", ")}`);
  return input;
}
function parseJsonBody(request: RegistryHttpBodyRequest): unknown {
  if ((request.body?.byteLength ?? 0) > MAX_TOTAL_BYTES + 65536) throw new RegistryValidationError("Registry JSON body is too large");
  if (!/^application\/json(?:\s*;|$)/i.test(stringHeader(request, "content-type") ?? "")) {
    throw new RegistryValidationError("Content-Type must be application/json");
  }
  if (request.body === undefined || request.body.byteLength === 0) throw new RegistryValidationError("A JSON object body is required");
  try {
    return JSON.parse(Buffer.from(request.body).toString("utf8"));
  } catch {
    throw new RegistryValidationError("Request body is not valid JSON");
  }
}
function parsePackageFile(value: unknown, index: number) {
  if (!isRecord(value)) throw new RegistryValidationError(`files[${index}] must be an object`);
  const unknown = unknownKeys(value, ["relativePath", "mode", "content"]);
  if (unknown.length > 0) throw new RegistryValidationError(`files[${index}] contains unexpected field ${unknown.sort().join(", ")}`);
  if (typeof value.content !== "string") throw new RegistryValidationError(`files[${index}].content must be a string`);
  return {
    relativePath: identifierField(value.relativePath, `files[${index}].relativePath`),
    mode: value.mode === 0o644 || value.mode === 0o755 ? value.mode : invalidMode(index),
    content: new TextEncoder().encode(value.content)
  };
}
function invalidMode(index: number): never {
  throw new RegistryValidationError(`files[${index}].mode must be 0644 or 0755`);
}
function parseCapabilities(value: unknown): SkillCapability[] {
  const allowed = new Set<SkillCapability>(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  const values = array(value, "capabilities");
  if (!values.every((item): item is SkillCapability => typeof item === "string" && allowed.has(item as SkillCapability))) {
    throw new RegistryValidationError("capabilities contains an invalid capability");
  }
  if (new Set(values).size !== values.length) throw new RegistryValidationError("capabilities contains a duplicate value");
  return [...values];
}
function parseProvenance(value: unknown): RegistryProvenanceReference[] {
  return array(value, "provenance").map((item, index) => {
    if (!isJsonRecord(item)) throw new RegistryValidationError(`provenance[${index}] must be an object`);
    const unknown = unknownKeys(item, ["artifactId", "revision", "contentHash"]);
    if (unknown.length > 0) throw new RegistryValidationError(`provenance[${index}] contains unexpected field ${unknown.sort().join(", ")}`);
    return {
      artifactId: identifierField(item.artifactId, `provenance[${index}].artifactId`),
      revision: sequenceField(item.revision, `provenance[${index}].revision`),
      contentHash: digestField(item.contentHash, `provenance[${index}].contentHash`)
    };
  });
}
function parseIdempotencyKey(request: RegistryHttpBodyRequest): string {
  const value = stringHeader(request, "idempotency-key");
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new RegistryValidationError("Idempotency-Key must be a canonical lowercase UUID");
  }
  return value;
}
function stringHeader(request: RegistryHttpBodyRequest, name: string): string | undefined {
  const value = Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return typeof value === "string" ? value : undefined;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new RegistryValidationError(`${field} must be an array`);
  return value;
}
function identifierField(value: unknown, field: string): string {
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return identifier(value, field);
}
function sequenceField(value: unknown, field: string): string {
  if (!isCanonicalRegistrySequence(value)) throw new RegistryValidationError(`${field} must be a canonical nonnegative decimal sequence`);
  return value;
}
function digestField(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError(`${field} must be a SHA-256 digest`);
  return value;
}
function nullablePackageHash(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a sha256-v2 package hash or null`);
  return packageHash(value);
}
function semanticVersion(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
    throw new RegistryValidationError("version must be a canonical semantic version");
  }
  return value;
}
