import type { BrainArtifactLayer, BrainArtifactType } from "./types.js";

export const brainArtifactTypes: readonly BrainArtifactType[] = [
  "note",
  "fact",
  "decision",
  "source",
  "source-observation",
  "project",
  "memory",
  "claim",
  "entity",
  "concept",
  "bounded-episode",
  "workflow",
  "feedback",
  "rejected-update",
  "skill-candidate",
  "skill-release",
  "hot-context",
  "index-chunk",
  "health-report"
];

export const brainArtifactLayers: readonly BrainArtifactLayer[] = [
  "evidence",
  "human-knowledge",
  "agent-knowledge",
  "workflow",
  "skill",
  "derived"
];

export const brainRelationshipTypes = [
  "about",
  "belongs-to",
  "caused-by",
  "contradicts",
  "derived-from",
  "documents",
  "duplicates",
  "fills-gap",
  "mentions",
  "observed-in",
  "promoted-to",
  "proposes",
  "rejected-by",
  "supported-by",
  "supersedes",
  "validated-by"
] as const;

export function defaultBrainLayer(type: BrainArtifactType): BrainArtifactLayer {
  if (type === "source" || type === "source-observation") return "evidence";
  if (type === "bounded-episode" || type === "memory" || type === "feedback" || type === "rejected-update") return "agent-knowledge";
  if (type === "workflow") return "workflow";
  if (type === "skill-candidate" || type === "skill-release") return "skill";
  if (type === "hot-context" || type === "index-chunk" || type === "health-report") return "derived";
  return "human-knowledge";
}
