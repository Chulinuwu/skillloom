import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { countToolCalls } from "./transcript.mjs";
import { readSkillloomMode } from "./config.mjs";

const input = await readInput();
const root = input && typeof input.cwd === "string" ? input.cwd : process.cwd();
const config = input ? await readSkillloomMode(root) : null;
if (input && config?.mode === "hermes" && input.stop_hook_active !== true) {
  const counted = typeof input.tool_count === "number" ? input.tool_count : await countToolCalls(input.transcript_path);
  if (counted === null || counted >= config.minToolCalls) {
    await checkpointEpisode(root, input, counted).catch(() => undefined);
    process.stdout.write(`${JSON.stringify({
      decision: "block",
      reason: "Skillloom Hermes automatic curation is due. A bounded local episode has been queued for background consolidation. Use $autonomous-learning now and choose exactly one bounded outcome: no-op, memory, skill-create, or skill-patch. A memory outcome searches before writing, performs at most one authenticated brain_capture, brain_update, or brain_link mutation, then records skillloom observe --outcome memory. If the Hub is unavailable, record only the local observation and do not claim a central write succeeded. Reusable procedures still require capture, validation, and skillloom promote --policy; rejected candidates stay quarantined. Never persist transcripts or credentials."
    })}\n`);
  }
}

async function checkpointEpisode(root, input, counted) {
  const now = new Date().toISOString();
  const source = typeof input.session_id === "string" ? input.session_id : "claude-stop";
  const episodeHash = hashText(`${root}:${source}:${counted ?? "unknown"}`);
  const eventId = `learn-stop-${episodeHash.slice(7, 19)}`;
  const jobId = `consolidate-stop-${episodeHash.slice(7, 19)}`;
  const learningRoot = join(root, ".skillloom", "learning");
  const events = join(learningRoot, "events");
  const jobs = join(learningRoot, "consolidation", "jobs");
  await mkdir(events, { recursive: true });
  await mkdir(jobs, { recursive: true });
  const episode = {
    taskId: `claude-stop-${episodeHash.slice(7, 19)}`,
    host: "claude",
    outcome: "unknown",
    startedAt: now,
    endedAt: now,
    evidence: [{
      summary: counted === null ? "Hermes Stop cadence met with unavailable bounded tool count" : `Hermes Stop cadence met after ${counted} tool calls`,
      category: "unknown",
      provenanceHash: episodeHash
    }],
    verifierSignals: [],
    provenanceHashes: [episodeHash]
  };
  await writeJsonIfAbsent(join(events, `${eventId}.json`), {
    eventId,
    createdAt: now,
    source: "claude",
    outcome: "no-op",
    summary: "Hermes Stop queued bounded episode for background consolidation",
    episode
  });
  await writeJsonIfAbsent(join(jobs, `${jobId}.json`), {
    jobId,
    eventId,
    episodeHash,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  });
}

async function writeJsonIfAbsent(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
}

function hashText(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
