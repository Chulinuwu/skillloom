import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import { demoCommand } from "../../src/commands/demo.js";

test("demo proves the Brain-to-skill trust boundary and cleans its workspace", async () => {
  const result = await demoCommand({ command: "demo", keep: false, json: true });

  assert.equal(result.summary.failed, 0);
  assert.deepEqual(result.checks.map(({ name, status }) => [name, status]), [
    ["cross-agent-retrieval", "passed"],
    ["missing-proof-stays-draft", "passed"],
    ["failed-proof-is-rejected", "passed"],
    ["manual-mode-blocks-promotion", "passed"],
    ["policy-mode-promotes", "passed"],
    ["rollback-removes-skill", "passed"]
  ]);
  assert.equal(result.workspaceRetained, false);
  await assert.rejects(() => stat(result.workspace), { code: "ENOENT" });
});

test("demo keeps an inspectable workspace only when requested", async () => {
  const result = await demoCommand({ command: "demo", keep: true, json: true });

  assert.equal(result.summary.failed, 0);
  assert.equal(result.workspaceRetained, true);
  assert.equal((await stat(result.workspace)).isDirectory(), true);
});
