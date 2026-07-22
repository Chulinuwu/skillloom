import { hashBrainContent } from "./hash.js";
import type { BrainService } from "./service.js";
import type { BrainLinkMutationResult, IngestSourceInput, IngestSourceResult, SourceExtractionInput, SourceGapInput } from "./types.js";

export async function ingestImmutableSource(brain: BrainService, input: IngestSourceInput): Promise<IngestSourceResult> {
  const capturedAt = sourceTimestamp(input.capturedAt);
  const fetchedAt = input.fetchedAt === undefined ? undefined : sourceTimestamp(input.fetchedAt);
  const contentHash = hashBrainContent(input.content);
  const source = await brain.capture({
    actor: input.actor,
    requestId: `${input.requestId}:source:${contentHash}`,
    type: "source",
    title: input.title,
    content: input.content,
    frontmatter: {
      ...(input.frontmatter ?? {}),
      immutable: true,
      contentHash
    },
    provenance: {
      ...input.provenance,
      ingestion: "immutable-source"
    },
    source: {
      sourceId: `source:${contentHash}`,
      capturedAt,
      contentHash,
      ...(input.uri === undefined ? {} : { uri: input.uri }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.mediaType === undefined ? {} : { mediaType: input.mediaType }),
      ...(fetchedAt === undefined ? {} : { fetchedAt }),
      ...(input.retrievedBy === undefined ? {} : { retrievedBy: input.retrievedBy })
    },
    sensitivity: input.sensitivity
  });
  const observation = await brain.capture({
    actor: input.actor,
    requestId: `${input.requestId}:source-observation:${contentHash}`,
    type: "source-observation",
    title: `Observed source: ${input.title}`,
    content: input.uri ?? input.title,
    frontmatter: {
      observedSource: true,
      canonicalSourceArtifactId: source.artifact.id,
      contentHash
    },
    provenance: {
      ...input.provenance,
      ingestion: "source-observation",
      canonicalSourceArtifactId: source.artifact.id,
      ...(input.uri === undefined ? {} : { uri: input.uri })
    },
    source: {
      sourceId: `observation:${input.requestId}:${contentHash}`,
      capturedAt,
      contentHash,
      ...(input.uri === undefined ? {} : { uri: input.uri }),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.mediaType === undefined ? {} : { mediaType: input.mediaType }),
      ...(fetchedAt === undefined ? {} : { fetchedAt }),
      ...(input.retrievedBy === undefined ? {} : { retrievedBy: input.retrievedBy })
    },
    sensitivity: input.sensitivity
  });
  const extracted = [];
  const links: BrainLinkMutationResult[] = [await brain.link({
    actor: input.actor,
    requestId: `${input.requestId}:source-observation-link:${contentHash}`,
    sourceArtifactId: observation.artifact.id,
    targetArtifactId: source.artifact.id,
    relationship: "documents"
  })];
  for (const extraction of input.extractions ?? []) {
    const artifact = await captureExtraction(brain, input, extraction, source.artifact.id, contentHash);
    extracted.push(artifact);
    links.push(await brain.link({
      actor: input.actor,
      requestId: `${extraction.requestId}:supported-by`,
      sourceArtifactId: artifact.artifact.id,
      targetArtifactId: source.artifact.id,
      relationship: "supported-by"
    }));
    for (const targetArtifactId of extraction.contradicts ?? []) {
      links.push(await brain.link({
        actor: input.actor,
        requestId: `${extraction.requestId}:contradicts:${targetArtifactId}`,
        sourceArtifactId: artifact.artifact.id,
        targetArtifactId,
        relationship: "contradicts"
      }));
    }
    for (const targetArtifactId of extraction.fillsGaps ?? []) {
      links.push(await brain.link({
        actor: input.actor,
        requestId: `${extraction.requestId}:fills-gap:${targetArtifactId}`,
        sourceArtifactId: artifact.artifact.id,
        targetArtifactId,
        relationship: "fills-gap"
      }));
    }
  }
  const gaps = [];
  for (const gap of input.gaps ?? []) {
    const artifact = await captureGap(brain, input, gap, source.artifact.id, contentHash);
    gaps.push(artifact);
    links.push(await brain.link({
      actor: input.actor,
      requestId: `${gap.requestId}:documents-gap`,
      sourceArtifactId: source.artifact.id,
      targetArtifactId: artifact.artifact.id,
      relationship: "documents"
    }));
  }
  return { source, extracted, links, gaps };
}

function sourceTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError("source timestamp must be a valid ISO timestamp");
  }
  return new Date(value).toISOString();
}

async function captureExtraction(brain: BrainService, input: IngestSourceInput, extraction: SourceExtractionInput, sourceArtifactId: string, contentHash: string) {
  return await brain.capture({
    actor: input.actor,
    requestId: `${input.requestId}:extract:${extraction.requestId}`,
    type: extraction.type,
    title: extraction.title,
    content: extraction.content,
    frontmatter: {
      extraction: true,
      sourceArtifactId
    },
    provenance: {
      ...input.provenance,
      sourceArtifactId,
      sourceContentHash: contentHash
    },
    details: {
      kind: "knowledge",
      status: "draft",
      ...(extraction.confidence === undefined ? {} : { confidence: extraction.confidence }),
      ...(extraction.entities === undefined ? {} : { entities: extraction.entities }),
      ...(extraction.concepts === undefined ? {} : { concepts: extraction.concepts })
    },
    sensitivity: input.sensitivity
  });
}

async function captureGap(brain: BrainService, input: IngestSourceInput, gap: SourceGapInput, sourceArtifactId: string, contentHash: string) {
  return await brain.capture({
    actor: input.actor,
    requestId: `${input.requestId}:gap:${gap.requestId}`,
    type: "health-report",
    title: gap.title,
    content: gap.question,
    frontmatter: {
      gap: true,
      sourceArtifactId
    },
    provenance: {
      ...input.provenance,
      sourceArtifactId,
      sourceContentHash: contentHash
    },
    sensitivity: input.sensitivity
  });
}
