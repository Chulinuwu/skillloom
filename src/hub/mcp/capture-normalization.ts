import { Buffer } from "node:buffer";
import {
  isBrainArtifactLayer,
  isBrainArtifactType,
  isBrainSensitivity,
  isCanonicalUuid,
  isJsonRecord,
  unknownKeys
} from "../adapter-schema.js";
import {
  parseBrainArtifactDetails,
  parseBrainSourceMetadata,
  validateBrainArtifactConsistency
} from "../brain/artifact-details.js";
import type {
  BrainArtifactDetails,
  BrainArtifactType,
  BrainJsonValue,
  CaptureBrainInput
} from "../brain/index.js";
import { defaultBrainLayer } from "../brain/vocabulary.js";
import { brainCaptureFields, reservedBrainCaptureFields } from "./capture-normalization-config.js";
import { BrainMcpError } from "./errors.js";

type NormalizationState = {
  normalizedFields: Set<string>;
  observed: Record<string, BrainJsonValue>;
};

export function normalizeBrainMcpCapture(value: unknown): Omit<CaptureBrainInput, "actor"> {
  if (!isJsonRecord(value)) throw validationError("brain_capture arguments must be a JSON object");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 2_250_000) {
    throw validationError("brain_capture arguments exceed the 2250000 byte limit");
  }
  const reserved = reservedBrainCaptureFields.filter((field) => field in value);
  if (reserved.length > 0) {
    throw validationError(`brain_capture cannot set server-owned fields: ${reserved.join(", ")}`);
  }
  if (!isCanonicalUuid(value.requestId)) {
    throw validationError("requestId must be a canonical lowercase UUID");
  }
  if (typeof value.title !== "string" || typeof value.content !== "string") {
    throw validationError("brain_capture title and content must be strings");
  }

  const state: NormalizationState = {
    normalizedFields: new Set(),
    observed: {}
  };
  let type = normalizedType(value.type, state);
  const normalizedDetails = normalizeDetails(type, value.details, state);
  type = normalizedDetails.type;
  const layer = defaultBrainLayer(type);
  if (value.layer !== undefined && (!isBrainArtifactLayer(value.layer) || value.layer !== layer)) {
    observe(state, "layer", value.layer);
  }
  const source = normalizeSource(value.source, state);
  const frontmatter = normalizeRecord("frontmatter", value.frontmatter, state);
  const suppliedProvenance = normalizeRecord("provenance", value.provenance, state);
  if (suppliedProvenance.skillloomCapture !== undefined) {
    state.observed.priorSkillloomCapture = suppliedProvenance.skillloomCapture;
  }
  const unmapped = unknownKeys(value, brainCaptureFields);
  if (unmapped.length > 0) {
    state.observed.unmapped = Object.fromEntries(unmapped.map((field) => [field, value[field]]));
  }
  const sensitivity = isBrainSensitivity(value.sensitivity) ? value.sensitivity : "private";
  if (value.sensitivity !== sensitivity) observe(state, "sensitivity", value.sensitivity ?? null);

  return {
    requestId: value.requestId,
    type,
    layer,
    title: value.title,
    content: value.content,
    frontmatter,
    provenance: {
      ...suppliedProvenance,
      skillloomCapture: {
        schemaVersion: 1,
        receivedFields: Object.keys(value).sort(),
        normalizedFields: [...state.normalizedFields].sort(),
        observed: state.observed
      }
    },
    ...(source === undefined ? {} : { source }),
    details: normalizedDetails.details,
    sensitivity
  };
}

function normalizedType(value: BrainJsonValue | undefined, state: NormalizationState): BrainArtifactType {
  if (isBrainArtifactType(value)) return value;
  observe(state, "type", value ?? null);
  return "note";
}

function normalizeDetails(
  type: BrainArtifactType,
  value: BrainJsonValue | undefined,
  state: NormalizationState
): { type: BrainArtifactType; details: BrainArtifactDetails } {
  if (value !== undefined) {
    try {
      const details = parseBrainArtifactDetails(value);
      validateBrainArtifactConsistency(type, defaultBrainLayer(type), details);
      return { type, details };
    } catch {
      observe(state, "details", value);
    }
  }
  if (requiresTypedDetails(type)) {
    state.normalizedFields.add("type");
    state.observed.type ??= type;
    return { type: "note", details: { kind: "none" } };
  }
  return { type, details: { kind: "none" } };
}

function normalizeSource(value: BrainJsonValue | undefined, state: NormalizationState) {
  if (value === undefined) return undefined;
  try {
    return parseBrainSourceMetadata(value);
  } catch {
    observe(state, "source", value);
    return undefined;
  }
}

function normalizeRecord(
  field: "frontmatter" | "provenance",
  value: BrainJsonValue | undefined,
  state: NormalizationState
): Record<string, BrainJsonValue> {
  if (value === undefined) return {};
  if (isJsonRecord(value)) return value;
  observe(state, field, value);
  return {};
}

function observe(state: NormalizationState, field: string, value: BrainJsonValue): void {
  state.normalizedFields.add(field);
  state.observed[field] = value;
}

function requiresTypedDetails(type: BrainArtifactType): boolean {
  return type === "bounded-episode"
    || type === "workflow"
    || type === "feedback"
    || type === "rejected-update";
}

function validationError(message: string): BrainMcpError {
  return new BrainMcpError("BRAIN_MCP_VALIDATION_ERROR", message);
}
