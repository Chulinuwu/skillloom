import assert from "node:assert/strict";
import test from "node:test";
import { initCommand } from "../../src/commands/init.js";
import { journeyCommand } from "../../src/commands/journey.js";
import { modeCommand } from "../../src/commands/mode.js";
import { observeCommand } from "../../src/commands/observe.js";
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
