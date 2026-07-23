import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillloomMode } from "./config.mjs";
import { ephemeralCapsule, issueContextCapsule } from "./context-state.mjs";
import { readHookInput } from "./input.mjs";
import { sessionContext } from "./messages.mjs";
import { countToolCalls } from "./transcript.mjs";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const skillPath = join(pluginRoot, "skills", "capture-learning", "SKILL.md");
const input = await readHookInput();
const root = input && typeof input.cwd === "string" ? input.cwd : process.cwd();
const { mode } = await readSkillloomMode(root);
let skillName = "capture-learning";
try {
  const source = await readFile(skillPath, "utf8");
  const name = source.match(/^name:\s*(.+)$/mu)?.[1]?.trim();
  if (name === "capture-learning") skillName = name;
} catch {
}
const sessionId = input && typeof input.session_id === "string" ? input.session_id : null;
const source = input && typeof input.source === "string" ? input.source : "startup";
const toolCount = input && Number.isInteger(input.tool_count) && input.tool_count >= 0
  ? input.tool_count
  : await countToolCalls(input?.transcript_path);
const capsule = sessionId
  ? await issueContextCapsule(root, { sessionId, mode, source, toolCount })
    .then((state) => ({ ...state, tracked: true }))
    .catch(() => ephemeralCapsule(root, mode))
  : ephemeralCapsule(root, mode);
const context = sessionContext({ mode, skillName, capsule, source });

process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context
  }
})}\n`);
