import { createHash } from "node:crypto";
import { canonicalizeJson } from "./canonical-json.js";

export function hashRegistryPayload(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value)).digest("hex")}`;
}

export function deterministicRegistryId(namespace: string, actorId: string, requestId: string): string {
  const hex = createHash("sha256").update(`${namespace}\0${actorId}\0${requestId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
