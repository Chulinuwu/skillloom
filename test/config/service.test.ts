import assert from "node:assert/strict";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ensureConfig, setMode } from "../../src/config/service.js";
import { tempDir } from "../helpers/fixtures.js";
import { statusCommand } from "../../src/commands/status.js";

test("reads v0.1 config with safe v0.2 defaults", async () => {
  const root = await tempDir("skillloom-config-");
  const createdAt = new Date().toISOString();
  await mkdir(join(root, ".skillloom"));
  await writeFile(join(root, ".skillloom", "config.json"), `${JSON.stringify({ version: 1, createdAt })}\n`);
  const config = await ensureConfig(root);
  assert.equal(config.mode, "manual");
  assert.deepEqual(config.policy.targets, ["claude", "codex"]);
  assert.equal(config.hermes.minToolCalls, 3);
});

test("status reports manual defaults without creating a store", async () => {
  const root = await tempDir("skillloom-status-");
  const status = await statusCommand({ command: "status", json: true }, root);
  assert.equal(status.mode, "manual");
  assert.equal(status.automation.retrieval, "explicit");
  assert.equal(status.automation.hostLifecycle.codex, "invoked");
  await assert.rejects(() => stat(join(root, ".skillloom")), { code: "ENOENT" });
});

test("persists mode without changing policy", async () => {
  const root = await tempDir("skillloom-config-");
  const before = await ensureConfig(root);
  const after = await setMode(root, "hermes");
  assert.equal(after.mode, "hermes");
  assert.deepEqual(after.policy, before.policy);
  assert.equal((await ensureConfig(root)).mode, "hermes");
});
