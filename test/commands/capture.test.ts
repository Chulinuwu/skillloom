import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";

test("init is idempotent", async () => {
  const root = await tempDir();
  await initCommand({ command: "init", root, json: true });
  await initCommand({ command: "init", root, json: true });
  const config = JSON.parse(await readFile(join(root, ".skillloom", "config.json"), "utf8")) as { version: number };
  assert.equal(config.version, 1);
});

test("captures immutable candidate and redacts evidence", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await initCommand({ command: "init", root, json: true });
  const result = await captureCommand({
    command: "capture",
    source,
    createdBy: "agent",
    evidence: ["task:42", "OPENAI_API_KEY=sk-secret", "transcript: hidden body"],
    json: true
  }, root);
  assert.equal(result.state, "captured");
  assert.match(result.candidateId, /^cand-/);
  await writeFile(join(source, "references", "checklist.md"), "changed\n");
  const snap = await readFile(join(root, ".skillloom", "candidates", result.candidateId, "skill", "references", "checklist.md"), "utf8");
  assert.equal(snap, "Keep evidence concise.\n");
  assert.deepEqual(result.evidence, ["task:42", "[REDACTED]", "[REDACTED]"]);
});
