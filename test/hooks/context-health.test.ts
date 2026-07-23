import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateContextFreshness,
  issueContextCapsule,
  markLearningReviewed,
  readContextState
} from "../../hooks/context-state.mjs";
import { isMeaningfulLearningDelta } from "../../hooks/context-policy.mjs";
import { analyzeTranscript } from "../../hooks/transcript.mjs";
import { tempDir } from "../helpers/fixtures.js";

test("context capsule epochs survive refresh and retain the learning checkpoint", async () => {
  const root = await tempDir("skillloom-context-");
  const first = await issueContextCapsule(root, {
    sessionId: "session-a",
    mode: "hermes",
    source: "startup",
    toolCount: 2,
    now: "2026-07-23T00:00:00.000Z"
  });
  await markLearningReviewed(root, "session-a", first, 120, "2026-07-23T00:01:00.000Z");
  const second = await issueContextCapsule(root, {
    sessionId: "session-a",
    mode: "hermes",
    source: "compact",
    toolCount: 8,
    now: "2026-07-23T00:02:00.000Z"
  });
  assert.equal(second.epoch, 2);
  assert.notEqual(second.capsuleId, first.capsuleId);
  assert.equal(second.reviewedTranscriptBytes, 120);
  assert.equal((await readContextState(root, "session-a"))?.lastReviewedAt, "2026-07-23T00:01:00.000Z");
});

test("freshness uses mode, age, and cumulative tool budget", () => {
  const state = {
    version: 1,
    capsuleId: "capsule",
    epoch: 1,
    mode: "hermes",
    source: "startup",
    issuedAt: "2026-07-23T00:00:00.000Z",
    issuedToolCount: 4,
    reviewedTranscriptBytes: 0,
    lastReviewedAt: null
  };
  assert.deepEqual(evaluateContextFreshness(state, {
    mode: "hermes",
    toolCount: 13,
    now: Date.parse("2026-07-23T00:14:59.000Z")
  }), { fresh: true, reason: "current" });
  assert.equal(evaluateContextFreshness(state, {
    mode: "hermes",
    toolCount: 14,
    now: Date.parse("2026-07-23T00:14:59.000Z")
  }).reason, "tool-budget-exhausted");
  assert.equal(evaluateContextFreshness(state, {
    mode: "policy",
    toolCount: 4,
    now: Date.parse("2026-07-23T00:01:00.000Z")
  }).reason, "mode-changed");
  assert.equal(evaluateContextFreshness(state, {
    mode: "hermes",
    toolCount: 4,
    now: Date.parse("2026-07-23T00:15:00.000Z")
  }).reason, "capsule-expired");
});

test("transcript analysis gates durable deltas without storing transcript content", async () => {
  const root = await tempDir("skillloom-transcript-");
  const path = join(root, "transcript.jsonl");
  await writeFile(path, [
    JSON.stringify({ message: { role: "user", content: "ไม่ใช่ แก้ใหม่ให้ตรงนี้" } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name: "Edit" }] } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }] } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name: "Read" }] } })
  ].join("\n"));
  const analysis = await analyzeTranscript(path);
  assert.deepEqual(analysis && {
    toolCalls: analysis.toolCalls,
    mutations: analysis.mutations,
    research: analysis.research,
    verifications: analysis.verifications,
    correctionSignals: analysis.correctionSignals
  }, { toolCalls: 3, mutations: 1, research: 1, verifications: 1, correctionSignals: 1 });
  assert.equal(isMeaningfulLearningDelta(analysis, 3, null, Date.parse("2026-07-23T00:00:00.000Z")), true);
  assert.equal(isMeaningfulLearningDelta(analysis, 4, null, Date.parse("2026-07-23T00:00:00.000Z")), false);
});
