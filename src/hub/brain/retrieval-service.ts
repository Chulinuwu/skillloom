import type { BrainAuditPort, BrainMetadataIndex, BrainSourceStore } from "./ports.js";
import { scoreBrainArtifact } from "./retrieval-scoring.js";
import { lintBrainHealth } from "./health.js";
import type { BrainArtifact, BrainLink } from "./types.js";
import type { BrainHealthReport, BrainHotContextItem, BrainRetrievalDecoration, BrainRetrievalFilters, BrainRetrievalItem, BrainRetrievalResult, BrainRetrievalTier, RetrieveBrainInput } from "./retrieval-types.js";
import { withoutContent } from "./validation.js";

type TierConfig = Readonly<{
  seedLimit: number;
  graphDepth: number;
  candidateLimit: number;
  resultLimit: number;
  hotLimit: number;
  hotBytes: number;
}>;

const tierConfig: Record<BrainRetrievalTier, TierConfig> = {
  quick: { seedLimit: 25, graphDepth: 0, candidateLimit: 25, resultLimit: 10, hotLimit: 4, hotBytes: 1_200 },
  standard: { seedLimit: 50, graphDepth: 1, candidateLimit: 80, resultLimit: 20, hotLimit: 6, hotBytes: 2_400 },
  deep: { seedLimit: 90, graphDepth: 2, candidateLimit: 140, resultLimit: 40, hotLimit: 10, hotBytes: 4_000 }
};

export class BrainRetrievalService {
  constructor(
    private readonly source: BrainSourceStore,
    private readonly audit: BrainAuditPort,
    private readonly index: BrainMetadataIndex,
    private readonly clock: () => Date
  ) {}

  async retrieve(input: RetrieveBrainInput): Promise<BrainRetrievalResult> {
    const repaired = await this.repairDerivedIndexIfDegraded();
    const retry = await this.withDerivedIndexRetry(() => this.retrieveOnce(input));
    return { ...retry.value, recoveredIndex: repaired || retry.recovered || retry.value.recoveredIndex };
  }

  async health(): Promise<BrainHealthReport> {
    const repaired = await this.repairDerivedIndexIfDegraded();
    const retry = await this.withDerivedIndexRetry(() => lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString()));
    return { ...retry.value, recoveredIndex: repaired || retry.recovered || retry.value.recoveredIndex };
  }

  private async retrieveOnce(input: RetrieveBrainInput): Promise<BrainRetrievalResult> {
    const tier = input.tier ?? "quick";
    const config = tierConfig[tier];
    const requestedLimit = input.limit ?? config.resultLimit;
    const limit = Math.min(config.resultLimit, Math.max(1, Number.isInteger(requestedLimit) ? requestedLimit : config.resultLimit));
    const artifacts = await this.source.list();
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const seeds = await this.index.search(input.query, undefined, config.seedLimit);
    const distances = await this.candidateDistances(seeds.map((seed) => seed.id), config, byId);
    const filters = input.filters ?? {};
    const scoredResults = [...distances.entries()]
      .flatMap(([artifactId, distance]) => {
        const artifact = byId.get(artifactId);
        if (!artifact || !matchesFilters(artifact, filters)) return [];
        const scored = scoreBrainArtifact(artifact, input.query, distance);
        if (scored.score <= 0) return [];
        return [this.item(scored.artifact, scored.score, scored.reasons, distance)];
      })
      .sort(compareItems)
      .slice(0, limit);
    const results = await decorateBrainRetrievalItems(scoredResults, byId, this.index);
    const health = tier === "deep" ? await lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString()) : undefined;
    return {
      tier,
      query: input.query,
      filters,
      results,
      hotContext: hotContext(results, byId, config),
      recoveredIndex: false,
      ...(health === undefined ? {} : { health })
    };
  }

  private async candidateDistances(seedIds: readonly string[], config: TierConfig, byId: ReadonlyMap<string, BrainArtifact>): Promise<Map<string, number>> {
    const distances = new Map<string, number>();
    const queue = seedIds.filter((id) => byId.has(id)).map((id) => ({ id, distance: 0 }));
    for (const id of seedIds) {
      if (byId.has(id)) distances.set(id, 0);
    }
    for (let cursor = 0; cursor < queue.length && distances.size < config.candidateLimit; cursor += 1) {
      const current = queue[cursor];
      if (!current || current.distance >= config.graphDepth) continue;
      const links = await this.index.links(current.id);
      for (const link of links) {
        const nextId = link.sourceArtifactId === current.id ? link.targetArtifactId : link.sourceArtifactId;
        if (!byId.has(nextId) || distances.has(nextId)) continue;
        distances.set(nextId, current.distance + 1);
        queue.push({ id: nextId, distance: current.distance + 1 });
        if (distances.size >= config.candidateLimit) break;
      }
    }
    return distances;
  }

  private item(
    artifact: BrainArtifact,
    score: number,
    reasons: BrainRetrievalItem["reasons"],
    graphDistance: number
  ): BrainRetrievalItem {
    return {
      ...withoutContent(artifact),
      excerpt: excerpt(artifact.content),
      score,
      graphDistance,
      reasons,
      decorations: { contradictions: [], gaps: [] }
    };
  }

  private async withDerivedIndexRetry<T>(fn: () => Promise<T>): Promise<{ value: T; recovered: boolean }> {
    try {
      return { value: await fn(), recovered: false };
    } catch (error) {
      await this.rebuildDerivedIndex();
      try {
        return { value: await fn(), recovered: true };
      } catch {
        throw error;
      }
    }
  }

  private async repairDerivedIndexIfDegraded(): Promise<boolean> {
    try {
      const report = await lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString());
      if (report.status === "ok") return false;
    } catch {
      await this.rebuildDerivedIndex();
      return true;
    }
    await this.rebuildDerivedIndex();
    return true;
  }

  private async rebuildDerivedIndex(): Promise<void> {
    await this.index.rebuild(await this.source.list(), await this.audit.readAll());
  }
}

function matchesFilters(artifact: BrainArtifact, filters: BrainRetrievalFilters): boolean {
  return (filters.types === undefined || filters.types.includes(artifact.type))
    && (filters.layers === undefined || filters.layers.includes(artifact.layer))
    && (filters.sensitivities === undefined || filters.sensitivities.includes(artifact.sensitivity))
    && (filters.statuses === undefined || (artifact.details.kind === "knowledge" && filters.statuses.includes(artifact.details.status)))
    && (filters.updatedAfter === undefined || artifact.updatedAt >= filters.updatedAfter)
    && (filters.updatedBefore === undefined || artifact.updatedAt <= filters.updatedBefore)
    && (filters.hasSource === undefined || (artifact.source !== undefined) === filters.hasSource);
}

function compareItems(left: BrainRetrievalItem, right: BrainRetrievalItem): number {
  return right.score - left.score || left.graphDistance - right.graphDistance || right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}

function hotContext(results: readonly BrainRetrievalItem[], byId: ReadonlyMap<string, BrainArtifact>, config: TierConfig): BrainHotContextItem[] {
  const items: BrainHotContextItem[] = [];
  let remaining = config.hotBytes;
  for (const result of results.slice(0, config.hotLimit)) {
    const artifact = byId.get(result.id);
    if (!artifact || remaining <= 0) continue;
    const content = clip(artifact.content, Math.min(480, remaining));
    remaining -= content.length;
    items.push({ artifactId: result.id, type: result.type, title: result.title, score: result.score, excerpt: result.excerpt, content });
  }
  return items;
}

export async function decorateBrainRetrievalItems(results: readonly BrainRetrievalItem[], byId: ReadonlyMap<string, BrainArtifact>, index: BrainMetadataIndex): Promise<BrainRetrievalItem[]> {
  const decorated: BrainRetrievalItem[] = [];
  for (const result of results) {
    const related = await index.links(result.id);
    decorated.push({
      ...result,
      decorations: {
        contradictions: relatedDecorations(result.id, related, byId, "contradicts"),
        gaps: [
          ...relatedDecorations(result.id, related, byId, "fills-gap"),
          ...relatedDecorations(result.id, related, byId, "identifies-gap")
        ].sort((left, right) => left.artifact.id.localeCompare(right.artifact.id))
      }
    });
  }
  return decorated;
}

function relatedDecorations(artifactId: string, links: readonly BrainLink[], byId: ReadonlyMap<string, BrainArtifact>, relationship: "contradicts" | "fills-gap" | "identifies-gap"): BrainRetrievalDecoration[] {
  return links
    .filter((link) => link.relationship === relationship)
    .flatMap((link) => {
      const relatedId = link.sourceArtifactId === artifactId ? link.targetArtifactId : link.sourceArtifactId;
      const artifact = byId.get(relatedId);
      return artifact === undefined ? [] : [{ artifact: withoutContent(artifact), relationship: relationship === "identifies-gap" ? "fills-gap" : relationship, link }];
    })
    .sort((left, right) => left.artifact.id.localeCompare(right.artifact.id));
}

function excerpt(content: string): string {
  return clip(content.replace(/\s+/g, " ").trim(), 220);
}

function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}
