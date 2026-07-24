import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { brainLayout } from "./layout.js";
import { ensureObsidianBases } from "./obsidian-bases.js";
import { synchronizeProjectionDirectory } from "./obsidian-projection-sync.js";
import { obsidianProjectionFilename } from "./obsidian-projection-path.js";
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
  const next = layout.obsidianProjectionNext;
  await Promise.all([
    rm(next, { recursive: true, force: true }),
    rm(layout.obsidianProjectionPrevious, { recursive: true, force: true })
  ]);
  await mkdir(next, { recursive: true });
  for (const artifact of artifacts) {
    await writeArtifactProjection(next, artifact);
  }
  const baseCount = await ensureObsidianBases(layout.obsidianBases);
  await synchronizeProjectionDirectory(next, layout.obsidianProjection);
  await rm(next, { recursive: true, force: true });
  return {
    root: layout.obsidianProjection,
    artifactCount: artifacts.length,
    baseCount
  };
}



async function writeArtifactProjection(root: string, artifact: BrainArtifact): Promise<void> {
  const directory = join(root, artifact.layer, artifact.type);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, obsidianProjectionFilename(artifact.title, artifact.id)), projectionMarkdown(artifact), { mode: 0o644 });
}

function projectionMarkdown(artifact: BrainArtifact): string {
  return `---\n${JSON.stringify({
    skillloomProjection: true,
    managedProjection: true,
    readOnly: false,
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
