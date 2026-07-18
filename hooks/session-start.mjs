#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(pluginRoot, "skills", "capture-learning", "SKILL.md");

function metadataValue(source, key) {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
  const value = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "mu"))?.[1]?.trim();
  return value?.replace(/^(["'])(.*)\1$/u, "$2");
}

let context = "Skillloom provides $capture-learning for reusable workflow evidence. Validate and report findings before requesting explicit promotion approval. Never promote autonomously.";

try {
  const source = await readFile(skillPath, "utf8");
  const name = metadataValue(source, "name");
  const description = metadataValue(source, "description");
  if (name === "capture-learning" && description) {
    const summary = description.split(". ", 1)[0].slice(0, 220);
    context = `Skillloom provides $${name}: ${summary}. Validate and report findings before requesting explicit promotion approval. Never promote autonomously.`;
  }
} catch {
  // Session startup remains available when local metadata cannot be read.
}

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context
  }
})}\n`);
