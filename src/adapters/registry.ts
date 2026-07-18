import type { GenericDirectoryAdapter, HarnessAdapter, ScopedHarnessAdapter } from "./types.js";
import type { ScopedTargetName } from "../domain/types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { agentsAdapter } from "./agents.js";
import { genericAdapter } from "./generic.js";
import { UsageError } from "../domain/errors.js";

export function getScopedAdapter(name: ScopedTargetName): ScopedHarnessAdapter {
  const adapter = getAdapter(name);
  if (adapter.kind !== "scoped") {
    throw new UsageError(`Target is not scope-based: ${name}`);
  }
  return adapter;
}

export function getGenericAdapter(): GenericDirectoryAdapter {
  return genericAdapter;
}

export function getAdapter(name: string): HarnessAdapter {
  if (name === "claude") {
    return claudeCodeAdapter;
  }
  if (name === "codex") {
    return codexAdapter;
  }
  if (name === "agents") {
    return agentsAdapter;
  }
  if (name === "generic") {
    return genericAdapter;
  }
  throw new UsageError(`Unknown target: ${name}`);
}
