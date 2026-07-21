import { createHash } from "node:crypto";
import type { BrainJsonValue } from "./types.js";

export function hashBrainContent(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function hashBrainPayload(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function deterministicBrainId(namespace: string, actorId: string, requestId: string): string {
  const hex = createHash("sha256").update(`${namespace}\0${actorId}\0${requestId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): BrainJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object") {
    const normalized: Record<string, BrainJsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const candidate = Object.getOwnPropertyDescriptor(value, key)?.value;
      if (candidate !== undefined) {
        normalized[key] = normalize(candidate);
      }
    }
    return normalized;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}
