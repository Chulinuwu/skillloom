import type { BrainArtifactLayer, BrainArtifactMetadata, BrainArtifactType, BrainLink, BrainSearchResult, BrainSensitivity } from "./types.js";

export type BrainRetrievalTier = "quick" | "standard" | "deep";

export type BrainRetrievalFilters = Readonly<{
  types?: readonly BrainArtifactType[];
  layers?: readonly BrainArtifactLayer[];
  sensitivities?: readonly BrainSensitivity[];
  statuses?: readonly ("draft" | "accepted" | "disputed" | "superseded")[];
  updatedAfter?: string;
  updatedBefore?: string;
  hasSource?: boolean;
}>;

export type RetrieveBrainInput = Readonly<{
  actor: { actorId: string };
  query: string;
  tier?: BrainRetrievalTier;
  limit?: number;
  filters?: BrainRetrievalFilters;
}>;

export type BrainRetrievalReason = Readonly<{
  kind: "title" | "content" | "metadata" | "graph" | "freshness";
  weight: number;
  detail: string;
}>;

export type BrainRetrievalDecoration = Readonly<{
  artifact: BrainArtifactMetadata;
  relationship: "contradicts" | "fills-gap";
  link: BrainLink;
}>;

export type BrainRetrievalItem = BrainSearchResult & Readonly<{
  score: number;
  graphDistance: number;
  reasons: readonly BrainRetrievalReason[];
  decorations: Readonly<{
    contradictions: readonly BrainRetrievalDecoration[];
    gaps: readonly BrainRetrievalDecoration[];
  }>;
}>;

export type BrainHotContextItem = Readonly<{
  artifactId: string;
  type: BrainArtifactType;
  title: string;
  score: number;
  excerpt: string;
  content: string;
}>;

export type BrainIndexHealthStatus = "ok" | "degraded";

export type BrainHealthIssue = Readonly<{
  code:
    | "canonical-artifact-missing-from-index"
    | "stale-index-artifact"
    | "audit-event-missing-from-index"
    | "stale-index-audit-event"
    | "audit-link-missing-from-index"
    | "stale-index-link"
    | "idempotency-missing-from-index"
    | "orphan-audit-link-endpoint"
    | "orphan-index-link-endpoint";
  severity: "warning" | "error";
  detail: string;
  artifactId?: string;
  linkId?: string;
  eventSequence?: string;
}>;

export type BrainHealthReport = Readonly<{
  status: BrainIndexHealthStatus;
  checkedAt: string;
  canonicalArtifacts: number;
  indexedArtifacts: number;
  auditEvents: number;
  indexedAuditEvents: number;
  indexedLinks: number;
  unresolvedGaps: number;
  contradictions?: number;
  recoveredIndex?: boolean;
  issues: readonly BrainHealthIssue[];
  recommendations: readonly string[];
}>;

export type BrainRetrievalResult = Readonly<{
  tier: BrainRetrievalTier;
  query: string;
  filters: BrainRetrievalFilters;
  results: readonly BrainRetrievalItem[];
  hotContext: readonly BrainHotContextItem[];
  recoveredIndex?: boolean;
  health?: BrainHealthReport;
}>;

export type BrainIndexHealthSnapshot = Readonly<{
  artifactIds: readonly string[];
  linkIds: readonly string[];
  eventSequences: readonly string[];
  idempotencyKeys: readonly string[];
}>;
