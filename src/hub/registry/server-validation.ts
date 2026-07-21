import type { SkillCapability } from "../../domain/types.js";
import { validateSkillPackage } from "../../skills/validate.js";
import { canonicalizeJson } from "./canonical-json.js";
import { RegistryValidationError } from "./errors.js";
import { RegistryPackageStager } from "./package-staging.js";
import { hashRegistryPayload } from "./server-hash.js";
import type { ProposeRegistryInput, PublishRegistryInput, RegistryValidationReport } from "./server-types.js";
import type { PackageBlobV1 } from "./types.js";

const capabilities = new Set<SkillCapability>(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);

export async function validateRegistryProposal(
  stager: RegistryPackageStager,
  input: ProposeRegistryInput
): Promise<{ blob: PackageBlobV1; report: RegistryValidationReport }> {
  validateActor(input.actor.actorId);
  validateRequestId(input.requestId);
  validateName(input.name);
  validatePackageHash(input.claimedPackageHash, "claimedPackageHash");
  if (input.baseReleaseHash !== null) validatePackageHash(input.baseReleaseHash, "baseReleaseHash");
  validateCapabilities(input.capabilities);
  const validated = await stager.withMaterialized(input.packageBlob, async (root, blob) => ({
    blob,
    validation: await validateSkillPackage(root, {
      expectedName: input.name,
      expectedHash: input.claimedPackageHash
    })
  }));
  const declared = validated.validation.metadata.capabilities ?? [];
  if (validated.validation.packageHash !== input.claimedPackageHash) {
    throw new RegistryValidationError("Claimed package hash does not match the server-validated sha256-v2 hash");
  }
  if (canonicalizeJson(declared) !== canonicalizeJson(input.capabilities)) {
    throw new RegistryValidationError("Claimed capabilities do not exactly match server-validated skill metadata");
  }
  const evidence = {
    schemaVersion: "skillloom-registry-validation-v1" as const,
    packageHash: validated.validation.packageHash,
    metadata: validated.validation.metadata,
    capabilities: declared,
    files: validated.validation.files.map((file) => ({
      relativePath: file.relativePath,
      size: file.size,
      mode: file.mode
    })),
    findings: validated.validation.findings
  };
  return {
    blob: validated.blob,
    report: Object.freeze({ ...evidence, validationDigest: hashRegistryPayload(evidence) })
  };
}

export function validateRegistryPublish(input: PublishRegistryInput): void {
  validateActor(input.actor.actorId);
  validateRequestId(input.requestId);
  validateName(input.candidateId);
  if (input.channel !== "stable") throw new RegistryValidationError("Initial registry publishing supports only the stable channel");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(input.version)) {
    throw new RegistryValidationError("version must be a canonical semantic version");
  }
}

export function validateActor(actorId: string): void {
  if (typeof actorId !== "string" || actorId.trim() !== actorId || actorId.length === 0 || actorId.includes("\0")) {
    throw new RegistryValidationError("actorId must be a canonical non-empty string");
  }
}

export function validateRequestId(requestId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new RegistryValidationError("requestId must be a UUID");
  }
}

function validateName(value: string): void {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.includes("\0")) {
    throw new RegistryValidationError("Registry identifier must be a canonical non-empty string");
  }
}

function validatePackageHash(value: string, field: string): void {
  if (!/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError(`${field} must be a sha256-v2 package hash`);
}

function validateCapabilities(value: readonly SkillCapability[]): void {
  if (!Array.isArray(value) || !value.every((item) => capabilities.has(item)) || new Set(value).size !== value.length) {
    throw new RegistryValidationError("capabilities must contain unique supported values");
  }
}
