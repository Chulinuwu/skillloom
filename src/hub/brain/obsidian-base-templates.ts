import type { BrainArtifactLayer } from "./types.js";

type ObsidianBaseDefinition = {
  file: string;
  layer: BrainArtifactLayer;
  name: string;
  extraFilter?: string;
};

export const obsidianBaseDefinitions: readonly ObsidianBaseDefinition[] = [
  { file: "Knowledge.base", layer: "human-knowledge", name: "Human knowledge" },
  { file: "Agent Knowledge.base", layer: "agent-knowledge", name: "Agent knowledge" },
  {
    file: "Gaps and Conflicts.base",
    layer: "derived",
    name: "Gaps and conflicts",
    extraFilter: 'type == "health-report" || type == "rejected-update"'
  }
];

export function renderObsidianBase(definition: ObsidianBaseDefinition): string {
  const filters = [
    "skillloomProjection == true",
    `layer == "${definition.layer}"`,
    ...(definition.extraFilter ? [definition.extraFilter] : [])
  ];
  return `filters:
  and:
${filters.map((filter) => `    - '${filter}'`).join("\n")}
properties:
  title:
    displayName: Title
  type:
    displayName: Type
  layer:
    displayName: Layer
  canonicalRevision:
    displayName: Revision
  sensitivity:
    displayName: Sensitivity
  detailsKind:
    displayName: Details
  file.path:
    displayName: Path
views:
  - type: table
    name: "${definition.name}"
    order:
      - title
      - type
      - layer
      - canonicalRevision
      - sensitivity
      - detailsKind
      - file.path
`;
}
