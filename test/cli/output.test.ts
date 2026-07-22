import assert from "node:assert/strict";
import test from "node:test";
import { formatOutput } from "../../src/cli/output.js";
import { modeProfileFor } from "../../src/config/mode-profile.js";

test("human mode output exposes the resolved automation profile", () => {
  const output = formatOutput({ mode: "hermes", policy: {}, automation: modeProfileFor("hermes") }, false);
  assert.match(output, /^mode: hermes$/mu);
  assert.match(output, /^automation: review=task-end brain=auto-curated retrieval=auto-bounded promotion=policy hosts=claude:automatic,codex:invoked,agents:invoked$/mu);
});

test("human status output exposes the resolved automation profile", () => {
  const output = formatOutput({
    mode: "manual",
    automation: modeProfileFor("manual"),
    learning: [],
    candidates: [],
    promotions: [],
    events: [],
    operations: [],
    lock: { state: "unlocked" }
  }, false);
  assert.match(output, /^mode: manual$/mu);
  assert.match(output, /^automation: review=manual brain=manual retrieval=explicit promotion=manual hosts=claude:invoked,codex:invoked,agents:invoked$/mu);
});
