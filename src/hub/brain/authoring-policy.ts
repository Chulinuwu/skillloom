import type { BrainArtifactType } from "./types.js";

const authorableTypes: ReadonlySet<BrainArtifactType> = new Set([
  "note",
  "fact",
  "decision",
  "project",
  "memory",
  "claim",
  "entity",
  "concept"
]);

export function isObsidianAuthorableType(type: BrainArtifactType): boolean {
  return authorableTypes.has(type);
}
