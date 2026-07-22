import { BrainValidationError } from "./errors.js";
import type { RetrieveBrainInput } from "./retrieval-types.js";
import { isBrainArtifactLayer, isBrainArtifactType, isBrainSensitivity } from "./validation.js";

export function validateRetrievalInput(input: RetrieveBrainInput): void {
  if (input.tier !== undefined && input.tier !== "quick" && input.tier !== "standard" && input.tier !== "deep") {
    throw new BrainValidationError("tier is not a supported brain retrieval tier");
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 40)) {
    throw new BrainValidationError("limit must be an integer between 1 and 40");
  }
  for (const type of input.filters?.types ?? []) {
    if (!isBrainArtifactType(type)) throw new BrainValidationError("filters.types contains an unsupported brain artifact type");
  }
  for (const layer of input.filters?.layers ?? []) {
    if (!isBrainArtifactLayer(layer)) throw new BrainValidationError("filters.layers contains an unsupported brain artifact layer");
  }
  for (const sensitivity of input.filters?.sensitivities ?? []) {
    if (!isBrainSensitivity(sensitivity)) throw new BrainValidationError("filters.sensitivities contains an unsupported brain sensitivity");
  }
  for (const status of input.filters?.statuses ?? []) {
    if (status !== "draft" && status !== "accepted" && status !== "disputed" && status !== "superseded") {
      throw new BrainValidationError("filters.statuses contains an unsupported knowledge status");
    }
  }
  validateIsoBoundary(input.filters?.updatedAfter, "filters.updatedAfter");
  validateIsoBoundary(input.filters?.updatedBefore, "filters.updatedBefore");
}

function validateIsoBoundary(value: string | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(Date.parse(value))) throw new BrainValidationError(`${field} must be an ISO timestamp`);
}
