import { parsePackageBlob, parseSignedManifest, parseSignedRelease } from "../registry/index.js";
import type { ChannelManifest, PackageBlobV1, RegistryRelease, SignedRegistryPayload } from "../registry/index.js";
import { HubResponseValidationError } from "./errors.js";

export function parseRegistryManifestEnvelope(value: unknown): SignedRegistryPayload<ChannelManifest> | null {
  const data = parseDataEnvelope(value);
  return data === null ? null : parseSignedManifest(data);
}

export function parseRegistryReleaseEnvelope(value: unknown): SignedRegistryPayload<RegistryRelease> {
  return parseSignedRelease(parseDataEnvelope(value));
}

export function parseRegistryBlobEnvelope(value: unknown): PackageBlobV1 {
  return parsePackageBlob(parseDataEnvelope(value));
}

function parseDataEnvelope(value: unknown): unknown {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "data")) {
    throw new HubResponseValidationError("Registry response envelope is invalid");
  }
  return value.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
