import assert from "node:assert/strict";
import test from "node:test";
import { initCommand } from "../../src/commands/init.js";
import { journeyCommand } from "../../src/commands/journey.js";
import { modeCommand } from "../../src/commands/mode.js";
import { observeCommand } from "../../src/commands/observe.js";
import { consolidateLearningCommand } from "../../src/commands/consolidate-learning.js";
import { drainBrainLearningHandoffs } from "../../src/learning/brain-drain.js";
import { runLearningConsolidation } from "../../src/learning/consolidation.js";
import { listBrainLearningHandoffs, listConsolidationJobs, listConsolidationProposals, writeConsolidationJob } from "../../src/store/learning.js";
import { tempDir } from "../helpers/fixtures.js";

test("records bounded learning decisions and exposes the journey", async () => {
  const root = await tempDir("skillloom-learning-");
  await initCommand({ command: "init", root, json: true });
  const mode = await modeCommand({ command: "mode", mode: "hermes", json: true }, root);
  assert.equal(mode.automation.brainCapture, "auto-curated");
  assert.equal(mode.automation.hostLifecycle.codex, "invoked");
  const event = await observeCommand({
    command: "observe",
    source: "codex",
    outcome: "no-op",
    summary: `  ${"reusable ".repeat(100)}`,
    json: true
  }, root);
  assert.equal(event.summary.length, 500);
  const journey = await journeyCommand({ command: "journey", json: true }, root);
  assert.deepEqual(journey.learning, [event]);
  assert.deepEqual(journey.candidates, []);
  assert.deepEqual(journey.promotions, []);
});

test("redacts transcript-like learning summaries", async () => {
  const root = await tempDir("skillloom-learning-");
  const event = await observeCommand({
    command: "observe",
    source: "claude",
    outcome: "memory",
    summary: "copy the full transcript here",
    json: true
  }, root);
  assert.equal(event.summary, "[REDACTED]");
});

test("records bounded episodes and enqueues consolidation idempotently", async () => {
  const root = await tempDir("skillloom-learning-episode-");
  const event = await observeCommand({
    command: "observe",
    source: "codex",
    outcome: "memory",
    summary: "Reusable test fix",
    taskId: "task-episode",
    taskOutcome: "success",
    evidence: Array.from({ length: 12 }, (_, index) => `shell:evidence ${index}`),
    verifier: ["test:passed:targeted test passed"],
    json: true
  }, root);
  assert.equal(event.episode?.evidence.length, 8);
  assert.equal(event.episode?.verifierSignals[0]?.kind, "test");
  assert.equal(event.episode?.provenanceHashes.every((hash) => hash.startsWith("sha256:")), true);
  const jobs = await listConsolidationJobs(root);
  assert.equal(jobs.length, 1);
  const handoffs = await listBrainLearningHandoffs(root);
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]?.kind, "episode");
  assert.equal(handoffs[0]?.kind === "episode" ? handoffs[0].capture.type : "", "bounded-episode");
  const duplicate = await observeCommand({
    command: "observe",
    source: "codex",
    outcome: "memory",
    summary: "Reusable test fix",
    taskId: "task-episode",
    taskOutcome: "success",
    evidence: Array.from({ length: 12 }, (_, index) => `shell:evidence ${index}`),
    verifier: ["test:passed:targeted test passed"],
    json: true
  }, root);
  assert.notEqual(duplicate.eventId, event.eventId);
  assert.equal((await listConsolidationJobs(root)).length, 1);
  assert.equal((await listBrainLearningHandoffs(root)).length, 1);
});

test("duplicate episode observe preserves drained handoff state", async () => {
  const root = await tempDir("skillloom-learning-drained-dedupe-");
  await observeCommand(episodeCommand("task-drained", "memory", "success"), root);
  const firstDrain = await drainBrainLearningHandoffs(root, {
    async capture() {
      return { artifact: { id: "brain-episode-1" } };
    }
  });
  assert.equal(firstDrain.drained, 1);
  await observeCommand(episodeCommand("task-drained", "memory", "success"), root);
  const handoffs = await listBrainLearningHandoffs(root);
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]?.status, "drained");
  assert.equal(handoffs[0]?.artifactId, "brain-episode-1");
});

test("consolidation waits for deterministic recurrence threshold", async () => {
  const root = await tempDir("skillloom-learning-threshold-");
  await observeCommand(episodeCommand("task-1", "memory", "success"), root);
  const first = await consolidateLearningCommand({ command: "consolidate-learning", json: true }, root);
  assert.equal(first.proposals[0]?.kind, "rejected-update");
  assert.match(first.proposals[0]?.reason ?? "", /threshold/u);
  await observeCommand(episodeCommand("task-2", "memory", "success"), root);
  const second = await consolidateLearningCommand({ command: "consolidate-learning", json: true }, root);
  assert.equal(second.proposals[0]?.kind, "heuristic");
});

test("consolidation writes feedback for recurring failures and workflow drafts for procedural successes", async () => {
  const root = await tempDir("skillloom-learning-proposals-");
  await observeCommand(episodeCommand("failure-1", "memory", "failure"), root);
  await observeCommand(episodeCommand("failure-2", "memory", "failure"), root);
  await observeCommand({ ...episodeCommand("workflow-1", "skill-create", "success"), evidence: ["test:bounded recurring evidence a"] }, root);
  await observeCommand({ ...episodeCommand("workflow-2", "skill-create", "success"), evidence: ["test:bounded recurring evidence b"] }, root);
  const result = await consolidateLearningCommand({ command: "consolidate-learning", json: true }, root);
  assert.equal(result.proposals.some((proposal) => proposal.kind === "feedback"), true);
  assert.equal(result.proposals.some((proposal) => proposal.kind === "workflow-draft"), true);
  assert.equal(result.proposals.some((proposal) => /Promotion remains blocked/u.test(proposal.content)), true);
  const handoffs = await listBrainLearningHandoffs(root);
  assert.equal(handoffs.filter((handoff) => handoff.kind === "episode").length, 4);
  assert.equal(handoffs.some((handoff) => handoff.kind === "proposal" && handoff.proposal.kind === "workflow-draft"), true);
});

test("consolidation recovers processing jobs and records partial writer failures", async () => {
  const root = await tempDir("skillloom-learning-recovery-");
  await observeCommand(episodeCommand("task-1", "memory", "success"), root);
  await observeCommand(episodeCommand("task-2", "memory", "success"), root);
  const job = (await listConsolidationJobs(root))[0];
  assert.ok(job);
  await writeConsolidationJob(root, { ...job, status: "processing" });
  const result = await runLearningConsolidation(root, {
    async capture() {
      throw new Error("remote writer unavailable");
    }
  });
  assert.equal(result.failed, 2);
  assert.equal(result.proposals[0]?.kind, "rejected-update");
  assert.equal(result.proposals[0]?.retryable, true);
  assert.match(result.proposals[0]?.reason ?? "", /remote writer unavailable/u);
  assert.equal((await listConsolidationJobs(root)).every((item) => item.status === "failed"), true);
});

test("writer drains episode before dependent proposal with idempotent request IDs", async () => {
  const root = await tempDir("skillloom-learning-writer-");
  await observeCommand(episodeCommand("failure-1", "memory", "failure"), root);
  await observeCommand(episodeCommand("failure-2", "memory", "failure"), root);
  const calls: { requestId: string; type: string; target?: string; promotable?: boolean }[] = [];
  const result = await runLearningConsolidation(root, {
    async capture(input) {
      calls.push({
        requestId: input.requestId,
        type: input.type,
        target: input.details?.kind === "feedback" || input.details?.kind === "rejected-update" ? input.details.targetArtifactId : undefined,
        promotable: input.details?.kind === "workflow" ? input.details.promotable : undefined
      });
      return { artifact: { id: `brain-${calls.length}` } };
    }
  });
  assert.equal(result.failed, 0);
  assert.equal(calls[0]?.type, "bounded-episode");
  assert.equal(calls[1]?.type, "feedback");
  assert.equal(calls[1]?.target, "brain-1");
  assert.equal(calls[0]?.requestId, calls[0]?.requestId.toLowerCase());
  assert.notEqual(calls[0]?.requestId, calls[1]?.requestId);
});

test("durable Brain handoff outbox drains episode before proposal after offline consolidation", async () => {
  const root = await tempDir("skillloom-learning-drain-");
  await observeCommand(episodeCommand("workflow-1", "skill-create", "success"), root);
  await observeCommand(episodeCommand("workflow-2", "skill-create", "success"), root);
  await consolidateLearningCommand({ command: "consolidate-learning", json: true }, root);
  const before = await listBrainLearningHandoffs(root);
  assert.equal(before.filter((handoff) => handoff.kind === "episode").length, 2);
  assert.equal(before.some((handoff) => handoff.kind === "proposal" && handoff.proposal.kind === "workflow-draft"), true);
  const calls: { type: string; requestId: string; promotable?: boolean }[] = [];
  const drained = await drainBrainLearningHandoffs(root, {
    async capture(input) {
      calls.push({
        type: input.type,
        requestId: input.requestId,
        promotable: input.details?.kind === "workflow" ? input.details.promotable : undefined
      });
      return { artifact: { id: `brain-${calls.length}` } };
    }
  });
  assert.equal(drained.failed, 0);
  assert.equal(drained.skipped, 0);
  assert.equal(calls[0]?.type, "bounded-episode");
  assert.equal(calls[1]?.type, "bounded-episode");
  assert.equal(calls[2]?.type, "workflow");
  assert.equal(calls[2]?.promotable, false);
  assert.equal(new Set(calls.map((call) => call.requestId)).size, calls.length);
  assert.equal((await listBrainLearningHandoffs(root)).every((handoff) => handoff.status === "drained" && handoff.artifactId !== undefined), true);
});

test("learning never retains raw transcripts or secret-like summaries", async () => {
  const root = await tempDir("skillloom-learning-redaction-");
  const event = await observeCommand({
    command: "observe",
    source: "claude",
    outcome: "memory",
    summary: "token sk-abc123 and full transcript",
    taskId: "secret-task",
    taskOutcome: "success",
    evidence: ["shell:OPENAI_API_KEY should not stay"],
    verifier: ["runtime:unknown:password=supersecret should not stay"],
    json: true
  }, root);
  assert.equal(event.summary, "[REDACTED]");
  assert.equal(event.episode?.evidence[0]?.summary, "[REDACTED]");
  assert.equal(event.episode?.verifierSignals[0]?.summary, "[REDACTED]");
  await observeCommand(episodeCommand("secret-task-2", "memory", "success"), root);
  await consolidateLearningCommand({ command: "consolidate-learning", json: true }, root);
  assert.equal(JSON.stringify(await listConsolidationProposals(root)).includes("OPENAI_API_KEY"), false);
});

function episodeCommand(taskId: string, outcome: "memory" | "skill-create", taskOutcome: "success" | "failure") {
  return {
    command: "observe" as const,
    source: "codex" as const,
    outcome,
    summary: `${taskOutcome} ${taskId}`,
    taskId,
    taskOutcome,
    evidence: ["test:bounded recurring evidence"],
    verifier: [taskOutcome === "success" ? "test:passed:targeted passed" : "test:failed:targeted failed"],
    json: true
  };
}
