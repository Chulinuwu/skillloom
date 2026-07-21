import type { SkillCapability, SkillMetadata, TrustFinding, TrustSeverity } from "../../domain/types.js";
import { RegistryValidationError } from "./errors.js";
import { hashRegistryPayload } from "./server-hash.js";
import type {
  RegistryCandidateRecord,
  RegistryIdempotencyRecord,
  RegistryPendingOperation,
  RegistryPublishResult,
  RegistryValidationFile,
  RegistryValidationReport
} from "./server-types.js";
import { parseChannelManifest, parseRegistryCandidate, parseRegistryRelease } from "./schema.js";
import type {
  ChannelManifest,
  RegistryCandidate,
  RegistryRelease,
  RegistrySignature,
  RegistrySignablePayload,
  SignedRegistryPayload
} from "./types.js";
import { parsePackageBlob } from "./package-blob.js";

export function parseRegistryPendingOperation(value: unknown): RegistryPendingOperation {
  const record = exactRecord(value, ["schemaVersion", "operationId", "action", "actorId", "requestId", "payloadHash", "result", "createdAt"], ["packageBlob"]);
  literal(record.schemaVersion, "skillloom-registry-operation-v1", "operation schemaVersion");
  const common = {
    schemaVersion: "skillloom-registry-operation-v1" as const,
    operationId: text(record.operationId, "operationId"),
    actorId: text(record.actorId, "actorId"),
    requestId: text(record.requestId, "requestId"),
    payloadHash: digest(record.payloadHash, "payloadHash"),
    createdAt: timestamp(record.createdAt, "createdAt")
  };
  if (record.action === "propose") {
    if (!Object.hasOwn(record, "packageBlob")) throw new RegistryValidationError("Proposal operation requires packageBlob");
    return { ...common, action: "propose", packageBlob: parsePackageBlob(record.packageBlob), result: parseCandidateRecord(record.result) };
  }
  if (record.action === "publish") {
    if (Object.hasOwn(record, "packageBlob")) throw new RegistryValidationError("Publish operation must not contain packageBlob");
    return { ...common, action: "publish", result: parsePublishResult(record.result) };
  }
  throw new RegistryValidationError("Registry operation action is invalid");
}

export function parseRegistryIdempotencyRecord(value: unknown): RegistryIdempotencyRecord {
  const record = exactRecord(value, ["schemaVersion", "action", "actorId", "requestId", "payloadHash", "result"]);
  literal(record.schemaVersion, "skillloom-registry-idempotency-v1", "idempotency schemaVersion");
  const common = {
    schemaVersion: "skillloom-registry-idempotency-v1" as const,
    actorId: text(record.actorId, "actorId"),
    requestId: text(record.requestId, "requestId"),
    payloadHash: digest(record.payloadHash, "payloadHash")
  };
  if (record.action === "propose") return { ...common, action: "propose", result: parseCandidateRecord(record.result) };
  if (record.action === "publish") return { ...common, action: "publish", result: parsePublishResult(record.result) };
  throw new RegistryValidationError("Idempotency action is invalid");
}

export function parseCandidateRecord(value: unknown): RegistryCandidateRecord {
  const record = exactRecord(value, ["candidate", "validation"]);
  const candidate = parseSigned(record.candidate, parseRegistryCandidate);
  const validation = parseValidationReport(record.validation);
  if (candidate.payload.packageHash !== validation.packageHash || candidate.payload.validationDigest !== validation.validationDigest) {
    throw new RegistryValidationError("Candidate does not match its validation report");
  }
  return { candidate, validation };
}

export function parsePublishResult(value: unknown): RegistryPublishResult {
  const record = exactRecord(value, ["release", "manifest"]);
  const release = parseSigned(record.release, parseRegistryRelease);
  const manifest = parseSigned(record.manifest, parseChannelManifest);
  if (!manifest.payload.releases.some((item) => item.releaseId === release.payload.releaseId && item.packageHash === release.payload.packageHash)) {
    throw new RegistryValidationError("Published manifest does not contain its release");
  }
  return { release, manifest };
}

export function parseSignedCandidate(value: unknown): SignedRegistryPayload<RegistryCandidate> {
  return parseSigned(value, parseRegistryCandidate);
}

export function parseSignedRelease(value: unknown): SignedRegistryPayload<RegistryRelease> {
  return parseSigned(value, parseRegistryRelease);
}

export function parseSignedManifest(value: unknown): SignedRegistryPayload<ChannelManifest> {
  return parseSigned(value, parseChannelManifest);
}

function parseValidationReport(value: unknown): RegistryValidationReport {
  const record = exactRecord(value, ["schemaVersion", "packageHash", "metadata", "capabilities", "files", "findings", "validationDigest"]);
  literal(record.schemaVersion, "skillloom-registry-validation-v1", "validation schemaVersion");
  const report = {
    schemaVersion: "skillloom-registry-validation-v1" as const,
    packageHash: packageHash(record.packageHash),
    metadata: metadata(record.metadata),
    capabilities: capabilityList(record.capabilities),
    files: list(record.files, file),
    findings: list(record.findings, finding),
    validationDigest: digest(record.validationDigest, "validationDigest")
  };
  const { validationDigest, ...evidence } = report;
  if (hashRegistryPayload(evidence) !== validationDigest) throw new RegistryValidationError("Validation report digest mismatch");
  return report;
}

function parseSigned<T extends RegistrySignablePayload>(value: unknown, parsePayload: (payload: unknown) => T): SignedRegistryPayload<T> {
  const record = exactRecord(value, ["payload", "signature"]);
  return { payload: parsePayload(record.payload), signature: signature(record.signature) };
}

function signature(value: unknown): RegistrySignature {
  const record = exactRecord(value, ["algorithm", "keyFingerprint", "value"]);
  literal(record.algorithm, "Ed25519", "signature algorithm");
  return {
    algorithm: "Ed25519",
    keyFingerprint: text(record.keyFingerprint, "keyFingerprint"),
    value: text(record.value, "signature value")
  };
}

function metadata(value: unknown): SkillMetadata {
  const record = exactRecord(value, ["name", "description"], ["capabilities"]);
  const parsedCapabilities = Object.hasOwn(record, "capabilities") ? capabilityList(record.capabilities) : [];
  return parsedCapabilities.length === 0
    ? { name: text(record.name, "metadata.name"), description: text(record.description, "metadata.description") }
    : { name: text(record.name, "metadata.name"), description: text(record.description, "metadata.description"), capabilities: parsedCapabilities };
}

function capabilityList(value: unknown): SkillCapability[] {
  const allowed = new Set<SkillCapability>(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item): item is SkillCapability => isCapability(item, allowed))) {
    throw new RegistryValidationError("Invalid validation capabilities");
  }
  if (new Set(value).size !== value.length) throw new RegistryValidationError("Duplicate validation capability");
  return [...value];
}

function isCapability(value: unknown, allowed: ReadonlySet<SkillCapability>): value is SkillCapability {
  return value === "filesystem-read"
    || value === "filesystem-write"
    || value === "network"
    || value === "shell"
    || value === "secrets"
      ? allowed.has(value)
      : false;
}

function file(value: unknown): RegistryValidationFile {
  const record = exactRecord(value, ["relativePath", "size", "mode"]);
  if (typeof record.size !== "number" || !Number.isSafeInteger(record.size) || record.size < 0 || typeof record.mode !== "number") {
    throw new RegistryValidationError("Invalid validation file");
  }
  return { relativePath: text(record.relativePath, "relativePath"), size: record.size, mode: record.mode };
}

function finding(value: unknown): TrustFinding {
  const record = exactRecord(value, ["ruleId", "severity", "file", "line", "message"]);
  const severity = trustSeverity(record.severity);
  if (typeof record.line !== "number" || !Number.isSafeInteger(record.line) || record.line < 1) throw new RegistryValidationError("Invalid finding line");
  return {
    ruleId: text(record.ruleId, "finding.ruleId"),
    severity,
    file: text(record.file, "finding.file"),
    line: record.line,
    message: text(record.message, "finding.message")
  };
}

function trustSeverity(value: unknown): TrustSeverity {
  if (value !== "info" && value !== "warning" && value !== "danger") throw new RegistryValidationError("Invalid finding severity");
  return value;
}

function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new RegistryValidationError("Expected an array");
  return value.map(parse);
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isRecord(value)) throw new RegistryValidationError("Expected a plain object");
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw new RegistryValidationError("Registry record has an invalid shape");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new RegistryValidationError(`${field} must be non-empty text`);
  return value;
}

function literal(value: unknown, expected: string, field: string): void {
  if (value !== expected) throw new RegistryValidationError(`${field} must equal ${expected}`);
}

function digest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError(`${field} must be a SHA-256 digest`);
  return value;
}

function packageHash(value: unknown): string {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError("Invalid validation package hash");
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new RegistryValidationError(`${field} must be a timestamp`);
  return value;
}
