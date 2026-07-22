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
      reason: "Skillloom Hermes automatic curation is due. Use $autonomous-learning now and choose exactly one bounded outcome: no-op, memory, skill-create, or skill-patch. A memory outcome searches before writing, performs at most one authenticated brain_capture, brain_update, or brain_link mutation, then records skillloom observe --outcome memory. If the Hub is unavailable, record only the local observation and do not claim a central write succeeded. Reusable procedures still require capture, validation, and skillloom promote --policy; rejected candidates stay quarantined. Never persist transcripts or credentials."
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
