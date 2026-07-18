import { DEFAULT_HERMES, DEFAULT_MODE, DEFAULT_POLICY, STORE_VERSION } from "./defaults.js";
import type { SkillloomConfig } from "./types.js";
import type { SkillloomMode } from "../domain/types.js";
import { ValidationError } from "../domain/errors.js";

export function createDefaultConfig(createdAt: string): SkillloomConfig {
  return {
    version: STORE_VERSION,
    createdAt,
    mode: DEFAULT_MODE,
    policy: { ...DEFAULT_POLICY, targets: [...DEFAULT_POLICY.targets], allowedCapabilities: [...DEFAULT_POLICY.allowedCapabilities] },
    hermes: { ...DEFAULT_HERMES }
  };
}

export function parseConfig(value: unknown): SkillloomConfig {
  if (!isRecord(value) || value.version !== STORE_VERSION || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    throw new ValidationError("Invalid Skillloom config");
  }
  const defaults = createDefaultConfig(value.createdAt);
  if (value.mode === undefined && value.policy === undefined && value.hermes === undefined) {
    return defaults;
  }
  if (!isMode(value.mode) || !isPolicy(value.policy) || !isHermes(value.hermes)) {
    throw new ValidationError("Invalid Skillloom config");
  }
  return { version: value.version, createdAt: value.createdAt, mode: value.mode, policy: value.policy, hermes: value.hermes };
}

function isPolicy(value: unknown): value is SkillloomConfig["policy"] {
  return isRecord(value)
    && Array.isArray(value.targets) && value.targets.every(isScopedTarget)
    && (value.scope === "project" || value.scope === "user")
    && isPositiveInteger(value.maxFiles)
    && isPositiveInteger(value.maxTotalBytes)
    && typeof value.allowWarnings === "boolean"
    && typeof value.allowExecutables === "boolean"
    && (value.allowedCapabilities === undefined || Array.isArray(value.allowedCapabilities) && value.allowedCapabilities.every(isCapability));
}

function isCapability(value: unknown): boolean {
  return value === "filesystem-read" || value === "filesystem-write" || value === "network" || value === "shell" || value === "secrets";
}
function isHermes(value: unknown): value is SkillloomConfig["hermes"] {
  return isRecord(value) && isPositiveInteger(value.minToolCalls);
}

function isMode(value: unknown): value is SkillloomMode {
  return value === "manual" || value === "policy" || value === "hermes";
}

function isScopedTarget(value: unknown): value is SkillloomConfig["policy"]["targets"][number] {
  return value === "claude" || value === "codex" || value === "agents";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
