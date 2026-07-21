import { RegistryCanonicalJsonError } from "./errors.js";
import type { RegistryJsonValue } from "./types.js";

export function canonicalizeJson(value: unknown): string {
  return encode(value, new Set());
}

export function parseCanonicalJson(text: string): RegistryJsonValue {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RegistryCanonicalJsonError("Canonical JSON must be valid JSON");
  }
  const canonical = canonicalizeJson(value);
  if (canonical !== text) throw new RegistryCanonicalJsonError("JSON input is not canonical");
  return value as RegistryJsonValue;
}

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    validateUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RegistryCanonicalJsonError("JSON numbers must be finite");
    if (Object.is(value, -0)) throw new RegistryCanonicalJsonError("JSON does not support negative zero canonically");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new RegistryCanonicalJsonError(`Unsupported JSON value type: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new RegistryCanonicalJsonError("Unsupported circular JSON value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return encodeArray(value, ancestors);
    return encodeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function encodeArray(value: unknown[], ancestors: Set<object>): string {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) throw new RegistryCanonicalJsonError("Unsupported sparse JSON array");
  }
  return `[${value.map((item) => encode(item, ancestors)).join(",")}]`;
}

function encodeObject(value: object, ancestors: Set<object>): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RegistryCanonicalJsonError("JSON objects must be plain objects");
  }
  const keys = Object.keys(value).sort();
  if (Reflect.ownKeys(value).length !== keys.length) {
    throw new RegistryCanonicalJsonError("Unsupported non-enumerable or symbol JSON property");
  }
  if (keys.some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined;
  })) {
    throw new RegistryCanonicalJsonError("Unsupported accessor JSON property");
  }
  return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(Reflect.get(value, key), ancestors)}`).join(",")}}`;
}

function validateUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new RegistryCanonicalJsonError("JSON strings must contain valid Unicode");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new RegistryCanonicalJsonError("JSON strings must contain valid Unicode");
    }
  }
}
