import type {
  BrainArtifact,
  BrainArtifactMetadata,
  BrainArtifactMutationResult,
  BrainLink,
  BrainLinkMutationResult,
  BrainSearchResult
} from "../brain/index.js";
import { isBrainArtifactType, isBrainSensitivity, isJsonRecord, isRecord } from "../adapter-schema.js";
import { HubResponseValidationError } from "./errors.js";

export function parseBrainDataEnvelope<T>(value: unknown, parse: (data: unknown) => T): T {
  if (!isRecord(value) || !Object.hasOwn(value, "data")) throw invalid("Hub response is missing data");
  return parse(value.data);
}

export function parseBrainSearchResults(value: unknown): BrainSearchResult[] {
  if (!Array.isArray(value)) throw invalid("Brain search data must be an array");
  return value.map((item) => {
    const metadata = parseArtifactMetadata(item);
    if (!isRecord(item) || typeof item.excerpt !== "string") throw invalid("Brain search result is malformed");
    return { ...metadata, excerpt: item.excerpt };
  });
}

export function parseBrainArtifact(value: unknown): BrainArtifact {
  const metadata = parseArtifactMetadata(value);
  if (!isRecord(value) || typeof value.content !== "string") throw invalid("Brain artifact content is malformed");
  return { ...metadata, content: value.content };
}

export function parseBrainArtifactMutation(value: unknown): BrainArtifactMutationResult {
  if (!isRecord(value) || value.kind !== "artifact" || typeof value.eventSequence !== "string") {
    throw invalid("Brain artifact mutation result is malformed");
  }
  return { kind: "artifact", artifact: parseArtifactMetadata(value.artifact), eventSequence: value.eventSequence };
}

export function parseBrainLinkMutation(value: unknown): BrainLinkMutationResult {
  if (!isRecord(value) || value.kind !== "link" || typeof value.eventSequence !== "string") {
    throw invalid("Brain link mutation result is malformed");
  }
  return { kind: "link", link: parseLink(value.link), eventSequence: value.eventSequence };
}

function parseArtifactMetadata(value: unknown): BrainArtifactMetadata {
  if (!isRecord(value)
    || typeof value.id !== "string" || !isBrainArtifactType(value.type) || typeof value.path !== "string"
    || typeof value.revision !== "string" || typeof value.contentHash !== "string" || typeof value.title !== "string"
    || !isJsonRecord(value.frontmatter) || !isJsonRecord(value.provenance) || !isBrainSensitivity(value.sensitivity)
    || typeof value.createdAt !== "string" || typeof value.createdBy !== "string"
    || typeof value.updatedAt !== "string" || typeof value.updatedBy !== "string") {
    throw invalid("Brain artifact metadata is malformed");
  }
  return {
    id: value.id,
    type: value.type,
    path: value.path,
    revision: value.revision,
    contentHash: value.contentHash,
    title: value.title,
    frontmatter: value.frontmatter,
    provenance: value.provenance,
    sensitivity: value.sensitivity,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy
  };
}

function parseLink(value: unknown): BrainLink {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.sourceArtifactId !== "string"
    || typeof value.targetArtifactId !== "string" || typeof value.relationship !== "string"
    || typeof value.createdAt !== "string" || typeof value.createdBy !== "string") {
    throw invalid("Brain link is malformed");
  }
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}

function invalid(message: string): HubResponseValidationError {
  return new HubResponseValidationError(message);
}
