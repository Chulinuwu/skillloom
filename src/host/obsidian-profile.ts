import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../files/atomic-write.js";

const VAULT_PATH = "/config/Documents/Skillloom";

type JsonRecord = Record<string, unknown>;

export async function prepareObsidianProfile(configRoot: string, now = Date.now()): Promise<void> {
  const profileDirectory = join(configRoot, ".config", "obsidian");
  const profilePath = join(profileDirectory, "obsidian.json");
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  const current = await readProfile(profilePath);
  const vaults = isRecord(current.vaults) ? current.vaults : {};
  const matchingEntry = Object.entries(vaults).find(([, value]) => isRecord(value) && value.path === VAULT_PATH);
  const vaultId = matchingEntry?.[0] ?? createHash("sha256").update(VAULT_PATH).digest("hex").slice(0, 16);
  const existingVault = isRecord(vaults[vaultId]) ? vaults[vaultId] : {};
  const nextVaults = Object.fromEntries(
    Object.entries(vaults).map(([id, value]) => [
      id,
      isRecord(value) ? { ...value, open: id === vaultId } : value
    ])
  );
  nextVaults[vaultId] = {
    ...existingVault,
    path: VAULT_PATH,
    ts: typeof existingVault.ts === "number" ? existingVault.ts : now,
    open: true
  };
  await atomicWriteFile(profilePath, JSON.stringify({ ...current, vaults: nextVaults }), { mode: 0o600 });
}

async function readProfile(path: string): Promise<JsonRecord> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(value)) throw new Error("profile root must be an object");
    return value;
  } catch (error) {
    if (isMissing(error)) return {};
    if (error instanceof SyntaxError) throw new Error(`Obsidian profile is malformed at ${path}`, { cause: error });
    throw error;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
