import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../files/atomic-write.js";

const WORKSPACE_FILES = ["workspace.json", "workspace-mobile.json"] as const;

export async function prepareObsidianWorkspace(vaultConfigRoot: string): Promise<void> {
  await Promise.all(WORKSPACE_FILES.map(async (file) => {
    const path = join(vaultConfigRoot, file);
    const source = await readWorkspace(path);
    if (source === null) return;
    const migrated = migrateWorkspaceValue(source.value);
    const content = JSON.stringify(migrated);
    if (content !== JSON.stringify(source.value)) {
      await atomicWriteFile(path, content, { mode: 0o600 });
    }
  }));
}

async function readWorkspace(path: string): Promise<{ value: unknown } | null> {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")) };
  } catch (error) {
    if (isMissing(error)) return null;
    if (error instanceof SyntaxError) throw new Error(`Obsidian workspace is malformed at ${path}`, { cause: error });
    throw error;
  }
}

function migrateWorkspaceValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/^Library\.(?:next|previous)\//u, "Library/")
      .replace(/^Library\/Bases(?=\/|$)/u, "Bases");
  }
  if (Array.isArray(value)) return value.map(migrateWorkspaceValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, migrateWorkspaceValue(entry)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
