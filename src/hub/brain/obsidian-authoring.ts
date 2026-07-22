import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { parseAuthoringDocument, serializeCuratedArtifact } from "./authoring-document.js";
import { readAuthoringCheckpoints, writeAuthoringCheckpoints } from "./authoring-checkpoints.js";
import {
  authoringCheckpointKey,
  authoringFileExists,
  curatedArtifactPath,
  ensureAuthoringDirectories,
  listMarkdownFiles,
  preserveAuthoringEvidence,
  readStableAuthoringFile,
  removeImportedInboxFile,
  writeAuthoringConflict,
  writeCuratedArtifact
} from "./authoring-files.js";
import { applyAuthoringDocument } from "./authoring-mutation.js";
import { isObsidianAuthorableType } from "./authoring-policy.js";
import type {
  AuthoringCheckpointMap,
  AuthoringCheckpoint,
  ObsidianAuthoringSync,
  ObsidianAuthoringSyncDependencies,
  ObsidianAuthoringSyncItem
} from "./authoring-types.js";
import { hashBrainContent } from "./hash.js";
import { brainLayout } from "./layout.js";
import type { BrainArtifact } from "./types.js";

export function createObsidianAuthoringSync(dependencies: ObsidianAuthoringSyncDependencies): ObsidianAuthoringSync {
  const layout = brainLayout(dependencies.root);
  const settleMs = dependencies.settleMs ?? 750;
  let queue: Promise<unknown> = Promise.resolve();
  const runExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const prepare = async (): Promise<void> => {
    await ensureAuthoringDirectories([
      layout.obsidianAuthoringInbox,
      layout.obsidianAuthoringCurated,
      layout.obsidianAuthoringEvidence,
      layout.obsidianAuthoringConflicts,
      dirname(layout.obsidianAuthoringCheckpoints)
    ]);
  };
  return {
    initialize: () => runExclusive(async () => {
      await prepare();
      const checkpoints = await readAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints);
      await refreshCanonical(dependencies, checkpoints, settleMs, []);
      await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
    }),
    sync: () => runExclusive(async () => {
      await prepare();
      const checkpoints = await readAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints);
      const items: ObsidianAuthoringSyncItem[] = [];
      await refreshCanonical(dependencies, checkpoints, settleMs, items);
      await syncDirectory(dependencies, checkpoints, layout.obsidianAuthoringInbox, false, settleMs, items);
      await syncDirectory(dependencies, checkpoints, layout.obsidianAuthoringCurated, true, settleMs, items);
      await refreshCanonical(dependencies, checkpoints, settleMs, items);
      await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
      return { items };
    })
  };
}

async function syncDirectory(
  dependencies: ObsidianAuthoringSyncDependencies,
  checkpoints: AuthoringCheckpointMap,
  root: string,
  requireTarget: boolean,
  settleMs: number,
  items: ObsidianAuthoringSyncItem[]
): Promise<void> {
  const layout = brainLayout(dependencies.root);
  for (const path of await listMarkdownFiles(root)) {
    const file = await readStableAuthoringFile(path, settleMs);
    if (file === null) {
      items.push({ path, status: "unsettled" });
      continue;
    }
    const key = authoringCheckpointKey(layout.obsidianAuthoring, path);
    if (checkpoints[key]?.contentHash === file.contentHash) {
      items.push({ path, contentHash: file.contentHash, status: "unchanged" });
      continue;
    }
    const document = parseAuthoringDocument(file.text, file.modifiedAt);
    const mutation = await applyAuthoringDocument({
      brain: dependencies.brain,
      actor: dependencies.actor,
      path,
      contentHash: file.contentHash,
      document,
      requireTarget
    });
    if (mutation.status === "conflict" || mutation.status === "quarantined") {
      await writeAuthoringConflict(layout.obsidianAuthoringConflicts, path, file.contentHash, file.text);
      checkpoints[key] = { contentHash: file.contentHash, state: mutation.status };
      await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
      items.push({ path, contentHash: file.contentHash, status: mutation.status, conflict: mutation.conflict });
      continue;
    }
    const artifact = await dependencies.brain.read({ actor: dependencies.actor, artifactId: mutation.artifact.artifact.id });
    await preserveAuthoringEvidence(layout.obsidianAuthoringEvidence, artifact.id, path, file.contentHash, file.text);
    const curated = await writeCuratedArtifact(layout.obsidianAuthoringCurated, artifact);
    const curatedKey = authoringCheckpointKey(layout.obsidianAuthoring, curated.path);
    checkpoints[curatedKey] = {
      contentHash: curated.contentHash,
      state: "synced",
      artifactId: artifact.id,
      revision: artifact.revision
    };
    await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
    if (!requireTarget) {
      await removeImportedInboxFile(path);
      delete checkpoints[key];
    } else if (path !== curated.path) {
      await rm(path, { force: true });
      delete checkpoints[key];
    }
    await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
    items.push({ path, contentHash: file.contentHash, status: mutation.status, artifact: mutation.artifact });
  }
}

async function refreshCanonical(
  dependencies: ObsidianAuthoringSyncDependencies,
  checkpoints: AuthoringCheckpointMap,
  settleMs: number,
  items: ObsidianAuthoringSyncItem[]
): Promise<void> {
  const layout = brainLayout(dependencies.root);
  const artifacts = (await dependencies.brain.list({ actor: dependencies.actor })).filter((artifact) => isObsidianAuthorableType(artifact.type));
  for (const artifact of artifacts) {
    const path = curatedArtifactPath(layout.obsidianAuthoringCurated, artifact);
    const key = authoringCheckpointKey(layout.obsidianAuthoring, path);
    if (!await authoringFileExists(path)) {
      const written = await writeCuratedArtifact(layout.obsidianAuthoringCurated, artifact);
      checkpoints[key] = syncedCheckpoint(artifact, written.contentHash);
      await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
      items.push({ path, contentHash: written.contentHash, status: "refreshed" });
      continue;
    }
    const current = await readStableAuthoringFile(path, settleMs);
    if (current === null) continue;
    const checkpoint = checkpoints[key];
    const desiredHash = hashBrainContent(serializeCuratedArtifact(artifact));
    if (checkpoint === undefined) {
      if (current.contentHash === desiredHash) {
        checkpoints[key] = syncedCheckpoint(artifact, current.contentHash);
        await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
      }
      continue;
    }
    if (checkpoint.state !== "synced" || checkpoint.contentHash !== current.contentHash) continue;
    if (current.contentHash === desiredHash) {
      checkpoints[key] = syncedCheckpoint(artifact, current.contentHash);
      continue;
    }
    const written = await writeCuratedArtifact(layout.obsidianAuthoringCurated, artifact);
    checkpoints[key] = syncedCheckpoint(artifact, written.contentHash);
    await writeAuthoringCheckpoints(layout.obsidianAuthoringCheckpoints, checkpoints);
    items.push({ path, contentHash: written.contentHash, status: "refreshed" });
  }
}

function syncedCheckpoint(artifact: BrainArtifact, contentHash: string): AuthoringCheckpoint {
  return {
    contentHash,
    state: "synced",
    artifactId: artifact.id,
    revision: artifact.revision
  };
}
