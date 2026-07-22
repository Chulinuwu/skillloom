import { access, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { hashBrainContent } from "./hash.js";
import type { BrainArtifact } from "./types.js";
import { serializeCuratedArtifact } from "./authoring-document.js";

export type StableAuthoringFile = {
  path: string;
  text: string;
  contentHash: string;
  modifiedAt: string;
};

export async function ensureAuthoringDirectories(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((path) => mkdir(path, { recursive: true })));
}

export async function listMarkdownFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  await collectMarkdownFiles(root, paths);
  return paths.sort((left, right) => left.localeCompare(right));
}

export async function readStableAuthoringFile(path: string, settleMs: number): Promise<StableAuthoringFile | null> {
  try {
    const before = await stat(path);
    if (!before.isFile() || (settleMs > 0 && Date.now() - before.mtimeMs < settleMs)) return null;
    const text = await readFile(path, "utf8");
    const after = await stat(path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) return null;
    return { path, text, contentHash: hashBrainContent(text), modifiedAt: after.mtime.toISOString() };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

export async function authoringFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

export function authoringCheckpointKey(root: string, path: string): string {
  return relative(root, path).split("\\").join("/");
}

export function curatedArtifactPath(root: string, artifact: Pick<BrainArtifact, "id" | "type">): string {
  return join(root, artifact.type, `${artifact.id}.md`);
}

export async function writeCuratedArtifact(root: string, artifact: BrainArtifact): Promise<{ path: string; contentHash: string }> {
  const path = curatedArtifactPath(root, artifact);
  const text = serializeCuratedArtifact(artifact);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, text, { mode: 0o600 });
  return { path, contentHash: hashBrainContent(text) };
}

export async function preserveAuthoringEvidence(
  evidenceRoot: string,
  artifactId: string,
  sourcePath: string,
  contentHash: string,
  text: string
): Promise<string> {
  const path = join(evidenceRoot, artifactId, `${safeSegment(contentHash)}-${safeSegment(basename(sourcePath))}`);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, text, { mode: 0o600 });
  return path;
}

export async function removeImportedInboxFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

export async function writeAuthoringConflict(root: string, sourcePath: string, contentHash: string, text: string): Promise<string> {
  const path = join(root, `${safeSegment(contentHash)}-${safeSegment(basename(sourcePath))}`);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, text, { mode: 0o600 });
  return path;
}

async function collectMarkdownFiles(root: string, paths: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await collectMarkdownFiles(path, paths);
    else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
  }
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
