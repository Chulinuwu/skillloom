import type { BrainArtifactType, BrainJsonValue, BrainSensitivity } from "./brain/index.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const artifactTypes: ReadonlySet<string> = new Set(["note", "fact", "decision", "source", "project", "memory"]);
const sensitivities: ReadonlySet<string> = new Set(["private", "tailnet", "restricted"]);

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function isBrainArtifactType(value: unknown): value is BrainArtifactType {
  return typeof value === "string" && artifactTypes.has(value);
}

export function isBrainSensitivity(value: unknown): value is BrainSensitivity {
  return typeof value === "string" && sensitivities.has(value);
}

export function isJsonRecord(value: unknown): value is Record<string, BrainJsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unknownKeys(value: Readonly<Record<string, unknown>>, allowedKeys: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowedKeys.includes(key)).sort();
}

function isJsonValue(value: unknown): value is BrainJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonRecord(value);
}
