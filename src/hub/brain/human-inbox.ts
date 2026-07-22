import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { applyAuthoringDocument } from "./authoring-mutation.js";
import { parseAuthoringDocument, serializeAuthoringDocument } from "./authoring-document.js";
import { readStableAuthoringFile } from "./authoring-files.js";
import { brainLayout } from "./layout.js";
import type { BrainService } from "./service.js";
import type { BrainActor, BrainArtifactType, BrainJsonValue, BrainSensitivity, HumanInboxImportResult } from "./types.js";

export async function stageHumanInboxNote(root: string, input: {
  slug: string;
  title: string;
  content: string;
  type?: BrainArtifactType;
  sensitivity?: BrainSensitivity;
  targetArtifactId?: string;
  baseRevision?: string;
  provenance?: Record<string, BrainJsonValue>;
  frontmatter?: Record<string, BrainJsonValue>;
}): Promise<string> {
  const layout = brainLayout(root);
  await mkdir(layout.humanInbox, { recursive: true });
  const path = join(layout.humanInbox, `${safeSlug(input.slug)}.md`);
  await atomicWriteFile(path, serializeAuthoringDocument({
    title: input.title,
    type: input.type,
    sensitivity: input.sensitivity,
    canonicalArtifactId: input.targetArtifactId,
    baseRevision: input.baseRevision,
    frontmatter: input.frontmatter,
    provenance: input.provenance,
    stagedAt: new Date().toISOString()
  }, input.content), { mode: 0o600 });
  return path;
}

export async function importHumanInbox(root: string, brain: BrainService, actor: BrainActor): Promise<HumanInboxImportResult[]> {
  const layout = brainLayout(root);
  await mkdir(layout.humanInbox, { recursive: true });
  const checkpoints = await readCheckpoints(layout.humanInboxCheckpoints);
  const results: HumanInboxImportResult[] = [];
  for (const entry of await readdir(layout.humanInbox, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(layout.humanInbox, entry.name);
    const file = await readStableAuthoringFile(path, 0);
    if (file === null) continue;
    if (checkpoints[path] === file.contentHash) {
      results.push({ path, contentHash: file.contentHash, imported: false });
      continue;
    }
    const mutation = await applyAuthoringDocument({
      brain,
      actor,
      path,
      contentHash: file.contentHash,
      document: parseAuthoringDocument(file.text, file.modifiedAt)
    });
    checkpoints[path] = file.contentHash;
    await writeCheckpoints(layout.humanInboxCheckpoints, checkpoints);
    results.push(mutation.status === "captured" || mutation.status === "updated"
      ? { path, contentHash: file.contentHash, imported: true, artifact: mutation.artifact }
      : { path, contentHash: file.contentHash, imported: true, conflict: mutation.conflict });
  }
  return results;
}

async function readCheckpoints(path: string): Promise<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isStringRecord(value) ? value : {};
  } catch {
    return {};
  }
}

async function writeCheckpoints(path: string, checkpoints: Record<string, string>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, JSON.stringify(checkpoints, null, 2), { mode: 0o600 });
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === "string");
}
