import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brainLayout } from "./layout.js";
import type { BrainService } from "./service.js";
import type { BrainActor, BrainArtifact, BrainArtifactLayer } from "./types.js";

export type ObsidianProjectionResult = {
  root: string;
  artifactCount: number;
  baseCount: number;
};

const baseDefinitions: readonly { file: string; layer: BrainArtifactLayer; name: string; extraFilter?: string }[] = [
  { file: "Knowledge.base", layer: "human-knowledge", name: "Human knowledge" },
  { file: "Agent Knowledge.base", layer: "agent-knowledge", name: "Agent knowledge" },
  { file: "Gaps and Conflicts.base", layer: "derived", name: "Gaps and conflicts", extraFilter: 'type == "health-report" || type == "rejected-update"' }
];

export async function rebuildObsidianProjection(root: string, brain: BrainService, actor: BrainActor): Promise<ObsidianProjectionResult> {
  return await rebuildObsidianProjectionFromArtifacts(root, await brain.list({ actor }));
}

export async function rebuildObsidianProjectionFromArtifacts(root: string, artifacts: readonly BrainArtifact[]): Promise<ObsidianProjectionResult> {
  const layout = brainLayout(root);
  await recoverProjectionSwap(layout.obsidianProjection);
  const next = `${layout.obsidianProjection}.next`;
  await rm(next, { recursive: true, force: true });
  await mkdir(join(next, "Bases"), { recursive: true });
  for (const artifact of artifacts) {
    await writeArtifactProjection(next, artifact);
  }
  await Promise.all(baseDefinitions.map((definition) => writeBase(join(next, "Bases"), definition)));
  await swapProjection(layout.obsidianProjection, next);
  return {
    root: layout.obsidianProjection,
    artifactCount: artifacts.length,
    baseCount: baseDefinitions.length
  };
}

async function recoverProjectionSwap(current: string): Promise<void> {
  const previous = `${current}.previous`;
  const next = `${current}.next`;
  if (!await pathExists(current) && await pathExists(next)) {
    await rename(next, current);
  }
  if (!await pathExists(current) && await pathExists(previous)) {
    await rename(previous, current);
  }
  await rm(next, { recursive: true, force: true });
  if (await pathExists(current)) {
    await rm(previous, { recursive: true, force: true });
  }
}

async function swapProjection(current: string, next: string): Promise<void> {
  const previous = `${current}.previous`;
  await mkdir(dirname(current), { recursive: true });
  await rm(previous, { recursive: true, force: true });
  if (await pathExists(current)) {
    await rename(current, previous);
  }
  await rename(next, current);
  await rm(previous, { recursive: true, force: true });
}

async function writeArtifactProjection(root: string, artifact: BrainArtifact): Promise<void> {
  const directory = join(root, artifact.layer, artifact.type);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${artifact.id}.md`), projectionMarkdown(artifact), { mode: 0o444 });
}

function projectionMarkdown(artifact: BrainArtifact): string {
  return `---\n${JSON.stringify({
    skillloomProjection: true,
    readOnly: true,
    canonicalArtifactId: artifact.id,
    canonicalRevision: artifact.revision,
    title: artifact.title,
    type: artifact.type,
    layer: artifact.layer,
    sensitivity: artifact.sensitivity,
    contentHash: artifact.contentHash,
    sourceId: artifact.source?.sourceId ?? null,
    detailsKind: artifact.details.kind
  })}\n---\n${artifact.content}`;
}

async function writeBase(directory: string, definition: { file: string; layer: BrainArtifactLayer; name: string; extraFilter?: string }): Promise<void> {
  await writeFile(join(directory, definition.file), baseYaml(definition), { mode: 0o444 });
}

function baseYaml(definition: { layer: BrainArtifactLayer; name: string; extraFilter?: string }): string {
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
