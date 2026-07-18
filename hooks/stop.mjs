import { countToolCalls } from "./transcript.mjs";
import { readSkillloomMode } from "./config.mjs";

const input = await readInput();
const root = input && typeof input.cwd === "string" ? input.cwd : process.cwd();
const config = input ? await readSkillloomMode(root) : null;
if (input && config?.mode === "hermes" && input.stop_hook_active !== true) {
  const counted = typeof input.tool_count === "number" ? input.tool_count : await countToolCalls(input.transcript_path);
  if (counted === null || counted >= config.minToolCalls) {
    process.stdout.write(`${JSON.stringify({
      decision: "block",
      reason: "Skillloom Hermes review is due. Use $autonomous-learning now. Record a concise no-op, memory, skill-create, or skill-patch decision with skillloom observe. For a reusable procedure, capture and validate a candidate, then use skillloom promote --policy. A rejected policy decision stays quarantined. Do not persist the transcript or credentials."
    })}\n`);
  }
}

async function readInput() {
  let source = "";
  for await (const chunk of process.stdin) {
    source += chunk;
    if (source.length > 1024 * 1024) {
      return null;
    }
  }
  try {
    const value = JSON.parse(source || "{}");
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return null;
  }
}
