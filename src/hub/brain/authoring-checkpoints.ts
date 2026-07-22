import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "../../files/atomic-write.js";
import type { AuthoringCheckpoint, AuthoringCheckpointMap } from "./authoring-types.js";

export async function readAuthoringCheckpoints(path: string): Promise<AuthoringCheckpointMap> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return {};
    throw error;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return {};
    const checkpoints: AuthoringCheckpointMap = {};
    for (const [key, item] of Object.entries(value)) {
      const checkpoint = parseCheckpoint(item);
      if (checkpoint !== undefined) checkpoints[key] = checkpoint;
    }
    return checkpoints;
  } catch {
    return {};
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

export async function writeAuthoringCheckpoints(path: string, checkpoints: AuthoringCheckpointMap): Promise<void> {
  await atomicWriteJson(path, checkpoints, { mode: 0o600 });
}

function parseCheckpoint(value: unknown): AuthoringCheckpoint | undefined {
  if (!isRecord(value) || typeof value.contentHash !== "string" || !isCheckpointState(value.state)) return undefined;
  if (value.artifactId !== undefined && typeof value.artifactId !== "string") return undefined;
  if (value.revision !== undefined && typeof value.revision !== "string") return undefined;
  return {
    contentHash: value.contentHash,
    state: value.state,
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(typeof value.revision === "string" ? { revision: value.revision } : {})
  };
}

function isCheckpointState(value: unknown): value is AuthoringCheckpoint["state"] {
  return value === "synced" || value === "conflict" || value === "quarantined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
