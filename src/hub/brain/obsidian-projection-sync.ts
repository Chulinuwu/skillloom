import { lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";

type EntryKind = "directory" | "file" | "other";

export async function synchronizeProjectionDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const [sourceEntries, targetEntries] = await Promise.all([
    collectEntries(source),
    collectEntries(target)
  ]);
  const sourceDirectories = [...sourceEntries]
    .filter(([, kind]) => kind === "directory")
    .map(([path]) => path)
    .sort(byDepth);
  for (const path of sourceDirectories) {
    await ensureDirectory(join(target, path));
  }
  for (const [path, kind] of sourceEntries) {
    if (kind === "directory") continue;
    if (kind === "other") throw new Error(`Projection staging contains an unsupported entry: ${path}`);
    await synchronizeFile(join(source, path), join(target, path));
  }
  const stale = [...targetEntries.keys()]
    .filter((path) => !sourceEntries.has(path))
    .sort((left, right) => byDepth(right, left));
  for (const path of stale) {
    await rm(join(target, path), { recursive: true, force: true });
  }
}

async function collectEntries(root: string, prefix = ""): Promise<Map<string, EntryKind>> {
  const entries = new Map<string, EntryKind>();
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      entries.set(path, "directory");
      for (const [nestedPath, kind] of await collectEntries(root, path)) {
        entries.set(nestedPath, kind);
      }
    } else entries.set(path, entry.isFile() ? "file" : "other");
  }
  return entries;
}

async function ensureDirectory(path: string): Promise<void> {
  const kind = await existingKind(path);
  if (kind === "directory") return;
  if (kind !== null) await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

async function synchronizeFile(source: string, target: string): Promise<void> {
  const data = await readFile(source);
  const kind = await existingKind(target);
  if (kind === "file" && (await readFile(target)).equals(data)) return;
  if (kind !== null) await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await atomicWriteFile(target, data, { mode: 0o444 });
}

async function existingKind(path: string): Promise<EntryKind | null> {
  try {
    const entry = await lstat(path);
    if (entry.isDirectory()) return "directory";
    return entry.isFile() ? "file" : "other";
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

function byDepth(left: string, right: string): number {
  return left.split(sep).length - right.split(sep).length;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
