import { ValidationError } from "../domain/errors.js";
import type { SkillCapability, SkillMetadata } from "../domain/types.js";

export function parseSkillMetadata(text: string): SkillMetadata {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new ValidationError("SKILL.md must start with YAML frontmatter");
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    throw new ValidationError("SKILL.md frontmatter is not closed");
  }
  const seen = new Map<string, string>();
  for (const line of normalized.slice(4, end).split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) {
      throw new ValidationError(`Invalid frontmatter line: ${line}`);
    }
    const [, key, rawValue] = match;
    if (seen.has(key)) {
      throw new ValidationError(`Duplicate frontmatter field: ${key}`);
    }
    seen.set(key, normalizeScalar(rawValue));
  }
  const name = seen.get("name");
  const description = seen.get("description");
  if (!name || !description) {
    throw new ValidationError("SKILL.md requires name and description");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) {
    throw new ValidationError(`Invalid skill name: ${name}`);
  }
  const capabilities = parseCapabilities(seen.get("capabilities"));
  return capabilities.length > 0 ? { name, description, capabilities } : { name, description };
}

function parseCapabilities(value: string | undefined): SkillCapability[] {
  if (!value) {
    return [];
  }
  const body = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  const capabilities = body.split(",").map((item) => normalizeScalar(item)).filter(Boolean);
  if (new Set(capabilities).size !== capabilities.length) {
    throw new ValidationError("Duplicate skill capability");
  }
  if (!capabilities.every(isSkillCapability)) {
    throw new ValidationError(`Invalid skill capability: ${capabilities.find((item) => !isSkillCapability(item))}`);
  }
  return capabilities;
}

function isSkillCapability(value: string): value is SkillCapability {
  return value === "filesystem-read" || value === "filesystem-write" || value === "network" || value === "shell" || value === "secrets";
}

function normalizeScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
