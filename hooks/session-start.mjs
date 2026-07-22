import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillloomMode } from "./config.mjs";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(pluginRoot, "skills", "capture-learning", "SKILL.md");
const { mode } = await readSkillloomMode(process.cwd());
let skillName = "capture-learning";
try {
  const source = await readFile(skillPath, "utf8");
  const name = source.match(/^name:\s*(.+)$/mu)?.[1]?.trim();
  if (name === "capture-learning") {
    skillName = name;
  }
} catch {
}

const learningContext = mode === "hermes"
  ? "Skillloom is in hermes mode. Before substantial work, run one bounded Brain recall with brain_search; read at most 3 high-confidence results. Continue if Hub unavailable and never claim success. At Stop, use $autonomous-learning for automatic curation. Promotion stays policy-gated. Claude hooks automate this lifecycle; Codex and agents require invocation."
  : mode === "policy"
    ? `Skillloom is in policy mode. Use $${skillName} for reusable workflows. Promotion with --policy is automatic only when deterministic project policy passes.`
    : `Skillloom is in manual mode. Use $${skillName} for reusable workflows. Validate findings and require explicit --yes approval before promotion.`;
const context = `Use $setup-skillloom to host or connect Skillloom and to report the private Hub and Obsidian URLs. ${learningContext}`;

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context
  }
})}\n`);
