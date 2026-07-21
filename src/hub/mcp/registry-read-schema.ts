import { isRecord, unknownKeys } from "../adapter-schema.js";
import { BrainMcpError } from "./errors.js";
import type { RegistryMcpReadInput, RegistryMcpReleasesInput } from "./types.js";

export function parseRegistryMcpReleases(value: unknown): RegistryMcpReleasesInput {
  const input = strictObject(value, ["limit"]);
  if (input.limit !== undefined
    && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw validationError("skill_releases limit must be an integer from 1 to 100");
  }
  return input.limit === undefined ? {} : { limit: input.limit };
}

export function parseRegistryMcpRead(value: unknown): RegistryMcpReadInput {
  const input = strictObject(value, ["releaseId"]);
  if (typeof input.releaseId !== "string"
    || input.releaseId.length === 0
    || input.releaseId.length > 200
    || input.releaseId !== input.releaseId.trim()
    || input.releaseId.includes("\\0")) {
    throw validationError("skill_read releaseId must be canonical text of at most 200 characters");
  }
  return { releaseId: input.releaseId };
}

function strictObject(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) throw validationError("Tool arguments must be an object");
  const unknown = unknownKeys(value, allowedKeys);
  if (unknown.length > 0) throw validationError(`Unknown tool arguments: ${unknown.sort().join(", ")}`);
  return value;
}

function validationError(message: string): BrainMcpError {
  return new BrainMcpError("BRAIN_MCP_VALIDATION_ERROR", message);
}
