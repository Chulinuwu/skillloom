import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brainLayout } from "./layout.js";
import { ensureObsidianBases } from "./obsidian-bases.js";
import type { BrainService } from "./service.js";
import type { BrainActor, BrainArtifact } from "./types.js";

export type ObsidianProjectionResult = {
  root: string;
  artifactCount: number;
  baseCount: number;
};


export async function rebuildObsidianProjection(root: string, brain: BrainService, actor: BrainActor): Promise<ObsidianProjectionResult> {
  return await rebuildObsidianProjectionFromArtifacts(root, await brain.list({ actor }));
}

export async function rebuildObsidianProjectionFromArtifacts(root: string, artifacts: readonly BrainArtifact[]): Promise<ObsidianProjectionResult> {
  const layout = brainLayout(root);
  await recoverProjectionSwap(layout.obsidianProjection, layout.obsidianProjectionNext, layout.obsidianProjectionPrevious);
  const next = layout.obsidianProjectionNext;
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  for (const artifact of artifacts) {
    await writeArtifactProjection(next, artifact);
  }
  const baseCount = await ensureObsidianBases(layout.obsidianBases);
  await swapProjection(layout.obsidianProjection, next, layout.obsidianProjectionPrevious);
  return {
    root: layout.obsidianProjection,
    artifactCount: artifacts.length,
    baseCount
  };
}

async function recoverProjectionSwap(current: string, next: string, previous: string): Promise<void> {
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

async function swapProjection(current: string, next: string, previous: string): Promise<void> {
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
