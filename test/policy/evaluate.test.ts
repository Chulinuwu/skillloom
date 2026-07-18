import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAutoPromotion } from "../../src/policy/evaluate.js";
import type { SkillloomConfig } from "../../src/config/types.js";

const config: SkillloomConfig = {
  version: 1,
  createdAt: "2026-07-18T00:00:00.000Z",
  mode: "policy",
  policy: {
    targets: ["claude", "codex"],
    scope: "project",
    maxFiles: 2,
    maxTotalBytes: 100,
    allowWarnings: false,
    allowExecutables: false
  },
  hermes: { minToolCalls: 3 }
};

test("approves a bounded project candidate", () => {
  const decision = evaluateAutoPromotion(config, {
    candidateId: "cand-1",
    packageHash: "abc",
    targets: ["claude", "codex"],
    scopes: ["project", "project"],
    files: [{ relativePath: "SKILL.md", size: 50, mode: 0o644 }],
    warnings: 0,
    dangers: 0
  });
  assert.equal(decision.approved, true);
  assert.deepEqual(decision.reasons, []);
});

test("rejects every policy boundary without partial approval", () => {
  const decision = evaluateAutoPromotion(config, {
    candidateId: "cand-1",
    packageHash: "abc",
    targets: ["generic"],
    scopes: ["explicit"],
    files: [
      { relativePath: "SKILL.md", size: 60, mode: 0o644 },
      { relativePath: "scripts/run.sh", size: 60, mode: 0o755 },
      { relativePath: "references/x.md", size: 1, mode: 0o644 }
    ],
    warnings: 1,
    dangers: 1
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.reasons.length, 7);
});
