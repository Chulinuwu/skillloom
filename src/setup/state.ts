import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "../files/atomic-write.js";
import type { Scope } from "../domain/types.js";
import type { SetupHarnessTarget } from "./types.js";

type SetupCompletion = {
  packageVersion: string;
  completedAt: string;
};

type SetupState = {
  version: 1;
  completed: Record<string, SetupCompletion>;
};

export async function readSetupState(root: string): Promise<SetupState> {
  try {
    return parseState(JSON.parse(await readFile(statePath(root), "utf8")));
  } catch (error) {
    if (isMissing(error)) return { version: 1, completed: {} };
    throw error;
  }
}

export async function checkpointSetupTarget(
  root: string,
  state: SetupState,
  target: SetupHarnessTarget,
  scope: Scope,
  packageVersion: string
): Promise<void> {
  state.completed[completionKey(target, scope)] = { packageVersion, completedAt: new Date().toISOString() };
  await mkdir(root, { recursive: true });
  await atomicWriteJson(statePath(root), state, { mode: 0o600 });
}

export function isSetupTargetCurrent(
  state: SetupState,
  target: SetupHarnessTarget,
  scope: Scope,
  packageVersion: string
): boolean {
  return state.completed[completionKey(target, scope)]?.packageVersion === packageVersion;
}

function statePath(root: string): string {
  return join(root, "setup.json");
}

function completionKey(target: SetupHarnessTarget, scope: Scope): string {
  return `${target}:${scope}`;
}

function parseState(value: unknown): SetupState {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("completed" in value) || typeof value.completed !== "object" || value.completed === null) {
    throw new Error("Invalid setup state");
  }
  const completed: Record<string, SetupCompletion> = {};
  for (const [key, item] of Object.entries(value.completed)) {
    if (typeof item !== "object" || item === null || !("packageVersion" in item) || typeof item.packageVersion !== "string" || !("completedAt" in item) || typeof item.completedAt !== "string") {
      throw new Error("Invalid setup state completion");
    }
    completed[key] = { packageVersion: item.packageVersion, completedAt: item.completedAt };
  }
  return { version: 1, completed };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
