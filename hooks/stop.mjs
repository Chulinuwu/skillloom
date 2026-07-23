import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readSkillloomMode } from "./config.mjs";
import {
  evaluateContextFreshness,
  issueContextCapsule,
  markLearningReviewed,
  readContextState
} from "./context-state.mjs";
import { isMeaningfulLearningDelta } from "./context-policy.mjs";
import { readHookInput } from "./input.mjs";
import { contextRefreshReason, learningReviewReason } from "./messages.mjs";
import { analyzeTranscript, countToolCalls } from "./transcript.mjs";

const input = await readHookInput();
if (input && input.stop_hook_active !== true) {
  await handleStop(input).catch(() => undefined);
}

async function handleStop(input) {
  const root = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const sessionId = typeof input.session_id === "string" ? input.session_id : "claude-default";
  const config = await readSkillloomMode(root);
  const counted = Number.isInteger(input.tool_count) && input.tool_count >= 0
    ? input.tool_count
    : await countToolCalls(input.transcript_path);
  const state = await readContextState(root, sessionId);
  const health = evaluateContextFreshness(state, {
    mode: config.mode,
    toolCount: counted,
    now: Date.now()
  });
  if (!health.fresh) {
    const capsule = await issueContextCapsule(root, {
      sessionId,
      mode: config.mode,
      source: "stop-refresh",
      toolCount: counted
    });
    block(contextRefreshReason(health, capsule, config.mode));
    return;
  }
  if (config.mode !== "hermes") return;
  const analysis = await analyzeTranscript(input.transcript_path, state.reviewedTranscriptBytes);
  if (!analysis || !isMeaningfulLearningDelta(analysis, config.minToolCalls, state.lastReviewedAt)) return;
  await checkpointEpisode(root, input, state, analysis);
  await markLearningReviewed(root, sessionId, state, analysis.fileSize);
  block(learningReviewReason());
}

function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
}

async function checkpointEpisode(root, input, state, analysis) {
  const now = new Date().toISOString();
  const source = typeof input.session_id === "string" ? input.session_id : "claude-stop";
  const episodeHash = hashText(`${root}:${source}:${state.epoch}:${state.reviewedTranscriptBytes}:${analysis.fileSize}`);
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
      summary: `Hermes meaningful delta: ${analysis.toolCalls} tools, ${analysis.mutations} mutations, ${analysis.research} research, ${analysis.verifications} verification, ${analysis.correctionSignals} corrections`,
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
    summary: "Hermes queued a meaningful durable delta for bounded consolidation",
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
