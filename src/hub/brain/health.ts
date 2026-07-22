import type { BrainAuditPort, BrainMetadataIndex, BrainSourceStore } from "./ports.js";
import type { BrainAuditEvent, BrainLink } from "./types.js";
import type { BrainHealthIssue, BrainHealthReport } from "./retrieval-types.js";

export async function lintBrainHealth(
  source: BrainSourceStore,
  audit: BrainAuditPort,
  index: BrainMetadataIndex,
  checkedAt: string
): Promise<BrainHealthReport> {
  const artifacts = await source.list();
  const events = await audit.readAll();
  const snapshot = await index.healthSnapshot();
  const canonicalArtifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const indexedArtifactIds = new Set(snapshot.artifactIds);
  const canonicalLinks = linkIds(events);
  const indexedLinks = new Set(snapshot.linkIds);
  const indexedLinkRecords = await collectIndexedLinks(index, new Set([...canonicalArtifactIds, ...indexedArtifactIds]));
  const issues: BrainHealthIssue[] = [];

  for (const artifactId of sorted(canonicalArtifactIds)) {
    if (!indexedArtifactIds.has(artifactId)) issues.push({ code: "canonical-artifact-missing-from-index", severity: "error", detail: "Canonical artifact is absent from the derived index", artifactId });
  }
  for (const artifactId of sorted(indexedArtifactIds)) {
    if (!canonicalArtifactIds.has(artifactId)) issues.push({ code: "stale-index-artifact", severity: "error", detail: "Derived index contains an artifact absent from the canonical store", artifactId });
  }
  for (const event of events) {
    if (!snapshot.eventSequences.includes(event.sequence)) issues.push({ code: "audit-event-missing-from-index", severity: "error", detail: "Audit event is absent from the derived index", eventSequence: event.sequence });
    if (!snapshot.idempotencyKeys.includes(`${event.actor.actorId}\u0000${event.requestId}`)) issues.push({ code: "idempotency-missing-from-index", severity: "error", detail: "Audit event lacks a derived idempotency record", eventSequence: event.sequence });
    if (event.result.kind === "link") pushOrphanLinkIssues(issues, canonicalArtifactIds, event.result.link, "orphan-audit-link-endpoint");
  }
  for (const eventSequence of snapshot.eventSequences) {
    if (!events.some((event) => event.sequence === eventSequence)) issues.push({ code: "stale-index-audit-event", severity: "error", detail: "Derived index contains an audit event absent from the audit log", eventSequence });
  }
  for (const linkId of [...canonicalLinks.keys()].sort()) {
    if (!indexedLinks.has(linkId)) issues.push({ code: "audit-link-missing-from-index", severity: "error", detail: "Audit link result is absent from the derived index", linkId });
  }
  for (const linkId of sorted(indexedLinks)) {
    if (!canonicalLinks.has(linkId)) issues.push({ code: "stale-index-link", severity: "warning", detail: "Derived index contains a link absent from the audit log", linkId });
  }
  for (const link of indexedLinkRecords) {
    pushOrphanLinkIssues(issues, canonicalArtifactIds, link, "orphan-index-link-endpoint");
  }

  return {
    status: issues.length === 0 ? "ok" : "degraded",
    checkedAt,
    canonicalArtifacts: canonicalArtifactIds.size,
    indexedArtifacts: indexedArtifactIds.size,
    auditEvents: events.length,
    indexedAuditEvents: snapshot.eventSequences.length,
    indexedLinks: snapshot.linkIds.length,
    unresolvedGaps: artifacts.filter((artifact) => artifact.type === "health-report" && artifact.frontmatter.gap === true).length,
    contradictions: [...canonicalLinks.values()].filter((link) => link.relationship === "contradicts").length,
    recoveredIndex: false,
    issues,
    recommendations: issues.length === 0 ? [] : ["rebuild-derived-index-from-canonical-store-and-audit-log"]
  };
}

function linkIds(events: readonly BrainAuditEvent[]): Map<string, BrainLink> {
  return new Map(events.flatMap((event) => event.result.kind === "link" ? [[event.result.link.id, event.result.link]] : []));
}

async function collectIndexedLinks(index: BrainMetadataIndex, artifactIds: ReadonlySet<string>): Promise<BrainLink[]> {
  const links = new Map<string, BrainLink>();
  for (const artifactId of sorted(artifactIds)) {
    for (const link of await index.links(artifactId)) {
      links.set(link.id, link);
    }
  }
  return [...links.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function pushOrphanLinkIssues(
  issues: BrainHealthIssue[],
  artifactIds: ReadonlySet<string>,
  link: BrainLink,
  code: "orphan-audit-link-endpoint" | "orphan-index-link-endpoint"
): void {
  if (!artifactIds.has(link.sourceArtifactId) || !artifactIds.has(link.targetArtifactId)) {
    issues.push({ code, severity: "error", detail: "Brain link points at a missing canonical artifact", linkId: link.id });
  }
}

function sorted(values: ReadonlySet<string>): string[] {
  return [...values].sort();
}
