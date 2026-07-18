import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tempDir } from "../helpers/fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Hermes Stop blocks once when review cadence is met", async () => {
  const project = await hermesProject();
  const first = await runStop({ cwd: project, tool_count: 3, stop_hook_active: false });
  assert.equal(JSON.parse(first).decision, "block");
  assert.match(JSON.parse(first).reason, /\$autonomous-learning/u);
  assert.equal(await runStop({ cwd: project, tool_count: 3, stop_hook_active: true }), "");
});

test("Hermes Stop allows a turn below cadence and manual mode", async () => {
  const project = await hermesProject();
  assert.equal(await runStop({ cwd: project, tool_count: 2, stop_hook_active: false }), "");
  const manual = await tempDir("skillloom-hook-manual-");
  assert.equal(await runStop({ cwd: manual, tool_count: 10, stop_hook_active: false }), "");
});

test("Stop fails open on malformed hook input", async () => {
  assert.equal(await runStopSource("{"), "");
});

async function hermesProject(): Promise<string> {
  const project = await tempDir("skillloom-hook-hermes-");
  await mkdir(join(project, ".skillloom"));
  await writeFile(join(project, ".skillloom", "config.json"), JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    mode: "hermes",
    policy: { targets: ["claude", "codex"], scope: "project", maxFiles: 20, maxTotalBytes: 262144, allowWarnings: false, allowExecutables: false },
    hermes: { minToolCalls: 3 }
  }));
  return project;
}

async function runStop(input: object): Promise<string> {
  return await runStopSource(JSON.stringify(input));
}

async function runStopSource(input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "hooks", "stop.mjs")]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 && stderr === "" ? resolve(stdout.trim()) : reject(new Error(stderr || `exit ${code}`)));
    child.stdin.end(input);
  });
}
