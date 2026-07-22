import type { BrainArtifact } from "./types.js";
import type { BrainRetrievalReason } from "./retrieval-types.js";

export type BrainScoredArtifact = Readonly<{
  artifact: BrainArtifact;
  score: number;
  reasons: readonly BrainRetrievalReason[];
}>;

export function scoreBrainArtifact(artifact: BrainArtifact, query: string, graphDistance: number): BrainScoredArtifact {
  const terms = queryTerms(query);
  const title = artifact.title.toLowerCase();
  const content = artifact.content.toLowerCase();
  const metadata = JSON.stringify({
    type: artifact.type,
    layer: artifact.layer,
    provenance: artifact.provenance,
    source: artifact.source ?? null,
    details: artifact.details
  }).toLowerCase();
  const reasons: BrainRetrievalReason[] = [];
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += addReason(reasons, "title", 12, `title matches ${term}`);
    if (content.includes(term)) score += addReason(reasons, "content", 4, `content matches ${term}`);
    if (metadata.includes(term)) score += addReason(reasons, "metadata", 3, `metadata matches ${term}`);
  }
  if (title.includes(query.trim().toLowerCase())) score += addReason(reasons, "title", 10, "title matches full query");
  if (graphDistance > 0) score += addReason(reasons, "graph", graphDistance === 1 ? 6 : 3, `linked at distance ${graphDistance}`);
  if (terms.length > 0 && score > 0) score += addReason(reasons, "freshness", freshnessWeight(artifact.updatedAt), "updated timestamp tie-breaker");
  return { artifact, score: Number(score.toFixed(3)), reasons };
}

export function queryTerms(query: string): string[] {
  return [...new Set((query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((term) => term.length > 0))].sort();
}

function addReason(reasons: BrainRetrievalReason[], kind: BrainRetrievalReason["kind"], weight: number, detail: string): number {
  reasons.push({ kind, weight, detail });
  return weight;
}

function freshnessWeight(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(0.999, Math.max(0, parsed / 10_000_000_000_000));
}
