import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { modeProfileFor } from "../../src/config/mode-profile.js";
import { readSkillloomMode } from "../../hooks/config.mjs";
import { tempDir } from "../helpers/fixtures.js";

const expected = {
  manual: { reviewTrigger: "manual", brainCapture: "manual", retrieval: "explicit", contextRefresh: "automatic", promotion: "manual" },
  policy: { reviewTrigger: "manual", brainCapture: "manual", retrieval: "explicit", contextRefresh: "automatic", promotion: "policy" },
  hermes: { reviewTrigger: "meaningful-delta", brainCapture: "auto-curated", retrieval: "auto-bounded", contextRefresh: "automatic", promotion: "policy" }
} as const;

for (const mode of ["manual", "policy", "hermes"] as const) {
  test(`${mode} resolves its automation profile`, () => {
    const profile = modeProfileFor(mode);
    assert.deepEqual({
      reviewTrigger: profile.reviewTrigger,
      brainCapture: profile.brainCapture,
      retrieval: profile.retrieval,
      contextRefresh: profile.contextRefresh,
      promotion: profile.promotion
    }, expected[mode]);
    assert.equal(profile.hostLifecycle.codex, "invoked");
    assert.equal(profile.hostLifecycle.agents, "invoked");
    assert.equal(profile.hostLifecycle.claude, mode === "hermes" ? "automatic" : "invoked");
  });
}

test("standalone hooks use the canonical TypeScript profile", async () => {
  for (const mode of ["manual", "policy", "hermes"] as const) {
    const root = await tempDir(`skillloom-profile-${mode}-`);
    await mkdir(join(root, ".skillloom"));
    await writeFile(join(root, ".skillloom", "config.json"), JSON.stringify({ mode, hermes: { minToolCalls: 3 } }));
    assert.deepEqual((await readSkillloomMode(root)).automation, modeProfileFor(mode));
  }
});
