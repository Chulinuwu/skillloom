import type {
  BrainArtifact,
  BrainArtifactMetadata,
  BrainArtifactMutationResult,
  BrainHealthIssue,
  BrainHealthReport,
  BrainLink,
  BrainLinkMutationResult,
  BrainRetrievalDecoration,
  BrainRetrievalItem,
  BrainRetrievalReason,
  BrainRetrievalResult,
  BrainSearchResult
} from "../brain/index.js";
import { isBrainArtifactLayer, isBrainArtifactType, isBrainSensitivity, isJsonRecord, isRecord } from "../adapter-schema.js";
import { HubResponseValidationError } from "./errors.js";
import { parseBrainArtifactDetails, parseBrainSourceMetadata } from "../brain/artifact-details.js";
import { defaultBrainLayer } from "../brain/vocabulary.js";

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
export function parseBrainRetrievalResult(value: unknown): BrainRetrievalResult {
  if (!isRecord(value) || (value.tier !== "quick" && value.tier !== "standard" && value.tier !== "deep")
    || typeof value.query !== "string" || !isRecord(value.filters) || !Array.isArray(value.results) || !Array.isArray(value.hotContext)
    || typeof value.recoveredIndex !== "boolean" || (value.health !== undefined && !isRecord(value.health))) {
    throw invalid("Brain retrieval result is malformed");
  }
  return {
    tier: value.tier,
    query: value.query,
    filters: value.filters,
    results: value.results.map(parseBrainRetrievalItem),
    hotContext: value.hotContext.map(parseHotContextItem),
    recoveredIndex: value.recoveredIndex,
    ...(value.health === undefined ? {} : { health: parseBrainHealthReport(value.health) })
  };
}
export function parseBrainHealthReport(value: unknown): BrainHealthReport {
  if (!isRecord(value) || (value.status !== "ok" && value.status !== "degraded") || typeof value.checkedAt !== "string"
    || typeof value.canonicalArtifacts !== "number" || typeof value.indexedArtifacts !== "number"
    || typeof value.auditEvents !== "number" || typeof value.indexedAuditEvents !== "number" || typeof value.indexedLinks !== "number"
    || typeof value.unresolvedGaps !== "number" || typeof value.contradictions !== "number" || typeof value.recoveredIndex !== "boolean"
    || !Array.isArray(value.issues) || !Array.isArray(value.recommendations) || !value.recommendations.every((item) => typeof item === "string")) {
    throw invalid("Brain health report is malformed");
  }
  return {
    status: value.status,
    checkedAt: value.checkedAt,
    canonicalArtifacts: value.canonicalArtifacts,
    indexedArtifacts: value.indexedArtifacts,
    auditEvents: value.auditEvents,
    indexedAuditEvents: value.indexedAuditEvents,
    indexedLinks: value.indexedLinks,
    unresolvedGaps: value.unresolvedGaps,
    contradictions: value.contradictions,
    recoveredIndex: value.recoveredIndex,
    issues: value.issues.map(parseHealthIssue),
    recommendations: value.recommendations
  };
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
    || (value.layer !== undefined && !isBrainArtifactLayer(value.layer))
    || (value.source !== undefined && !isJsonRecord(value.source))
    || (value.details !== undefined && !isJsonRecord(value.details))
    || typeof value.createdAt !== "string" || typeof value.createdBy !== "string"
    || typeof value.updatedAt !== "string" || typeof value.updatedBy !== "string") {
    throw invalid("Brain artifact metadata is malformed");
  }
  return {
    id: value.id,
    type: value.type,
    layer: value.layer ?? defaultBrainLayer(value.type),
    path: value.path,
    revision: value.revision,
    contentHash: value.contentHash,
    title: value.title,
    frontmatter: value.frontmatter,
    provenance: value.provenance,
    ...(value.source === undefined ? {} : { source: parseBrainSourceMetadata(value.source) }),
    details: parseBrainArtifactDetails(value.details ?? {}),
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

function parseBrainRetrievalItem(value: unknown): BrainRetrievalItem {
  const metadata = parseArtifactMetadata(value);
  if (!isRecord(value) || typeof value.excerpt !== "string" || typeof value.score !== "number" || typeof value.graphDistance !== "number"
    || !Array.isArray(value.reasons) || !isRecord(value.decorations)) {
    throw invalid("Brain retrieval item is malformed");
  }
  if (!Array.isArray(value.decorations.contradictions) || !Array.isArray(value.decorations.gaps)) {
    throw invalid("Brain retrieval decorations are malformed");
  }
  return {
    ...metadata,
    excerpt: value.excerpt,
    score: value.score,
    graphDistance: value.graphDistance,
    reasons: value.reasons.map(parseRetrievalReason),
    decorations: {
      contradictions: value.decorations.contradictions.map(parseRetrievalDecoration),
      gaps: value.decorations.gaps.map(parseRetrievalDecoration)
    }
  };
}

function parseRetrievalReason(value: unknown): BrainRetrievalReason {
  if (!isRecord(value) || (value.kind !== "title" && value.kind !== "content" && value.kind !== "metadata" && value.kind !== "graph" && value.kind !== "freshness")
    || typeof value.weight !== "number" || typeof value.detail !== "string") {
    throw invalid("Brain retrieval reason is malformed");
  }
  return { kind: value.kind, weight: value.weight, detail: value.detail };
}

function parseRetrievalDecoration(value: unknown): BrainRetrievalDecoration {
  if (!isRecord(value) || (value.relationship !== "contradicts" && value.relationship !== "fills-gap")) {
    throw invalid("Brain retrieval decoration is malformed");
  }
  return { artifact: parseArtifactMetadata(value.artifact), relationship: value.relationship, link: parseLink(value.link) };
}

function parseHotContextItem(value: unknown) {
  if (!isRecord(value) || typeof value.artifactId !== "string" || !isBrainArtifactType(value.type)
    || typeof value.title !== "string" || typeof value.score !== "number" || typeof value.excerpt !== "string" || typeof value.content !== "string") {
    throw invalid("Brain hot context item is malformed");
  }
  return { artifactId: value.artifactId, type: value.type, title: value.title, score: value.score, excerpt: value.excerpt, content: value.content };
}

function parseHealthIssue(value: unknown): BrainHealthIssue {
  if (!isRecord(value) || !isHealthIssueCode(value.code) || (value.severity !== "warning" && value.severity !== "error") || typeof value.detail !== "string"
    || (value.artifactId !== undefined && typeof value.artifactId !== "string")
    || (value.linkId !== undefined && typeof value.linkId !== "string")
    || (value.eventSequence !== undefined && typeof value.eventSequence !== "string")) {
    throw invalid("Brain health issue is malformed");
  }
  return {
    code: value.code,
    severity: value.severity,
    detail: value.detail,
    ...(value.artifactId === undefined ? {} : { artifactId: value.artifactId }),
    ...(value.linkId === undefined ? {} : { linkId: value.linkId }),
    ...(value.eventSequence === undefined ? {} : { eventSequence: value.eventSequence })
  };
}
function isHealthIssueCode(value: unknown): value is BrainHealthIssue["code"] {
  return value === "canonical-artifact-missing-from-index"
    || value === "stale-index-artifact"
    || value === "audit-event-missing-from-index"
    || value === "stale-index-audit-event"
    || value === "audit-link-missing-from-index"
    || value === "stale-index-link"
    || value === "idempotency-missing-from-index"
    || value === "orphan-audit-link-endpoint"
    || value === "orphan-index-link-endpoint";
}

function invalid(message: string): HubResponseValidationError {
  return new HubResponseValidationError(message);
}
