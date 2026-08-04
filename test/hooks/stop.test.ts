import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tempDir } from "../helpers/fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Hermes Stop reviews one meaningful delta and checkpoints it", async () => {
  const project = await hermesProject();
  const transcript = await toolTranscript(project, ["Edit", "Read", "Bash"]);
  await runSessionStart({ cwd: project, session_id: "session-a", source: "startup", tool_count: 0, transcript_path: transcript });
  const first = await runStop({
    cwd: project,
    tool_count: 3,
    stop_hook_active: false,
    session_id: "session-a",
    transcript_path: transcript
  });
  const reason = JSON.parse(first).reason as string;
  assert.match(reason, /\$autonomous-learning/u);
  assert.match(reason, /meaningful durable delta/u);
  assert.match(reason, /exactly one bounded outcome/u);
  assert.match(reason, /brain_capture, brain_update, or brain_link/u);
  assert.match(reason, /do not claim a central write succeeded/u);
  assert.match(reason, /queued for background consolidation/u);
  assert.equal(await runStop({
    cwd: project,
    tool_count: 3,
    stop_hook_active: false,
    session_id: "session-a",
    transcript_path: transcript
  }), "");
  const events = await readdir(join(project, ".skillloom", "learning", "events"));
  const jobs = await readdir(join(project, ".skillloom", "learning", "consolidation", "jobs"));
  assert.equal(events.length, 1);
  assert.equal(jobs.length, 1);
  const event = await readFile(join(project, ".skillloom", "learning", "events", events[0]), "utf8");
  assert.equal(event.includes(transcript), false);
  assert.equal(await runStop({ cwd: project, tool_count: 3, stop_hook_active: true }), "");
});

test("Hermes Stop ignores cadence without a meaningful durable delta", async () => {
  const project = await hermesProject();
  const transcript = await toolTranscript(project, ["Read", "Glob", "Task"]);
  await runSessionStart({ cwd: project, session_id: "session-b", source: "startup", tool_count: 0, transcript_path: transcript });
  assert.equal(await runStop({
    cwd: project,
    tool_count: 3,
    stop_hook_active: false,
    session_id: "session-b",
    transcript_path: transcript
  }), "");
});

test("Stop refreshes stale context silently and separately from autonomous learning in every mode", async () => {
  const project = await hermesProject();
  const transcript = await toolTranscript(project, ["Edit", "Read", "Bash"]);
  await runSessionStart({ cwd: project, session_id: "session-c", source: "startup", tool_count: 0, transcript_path: transcript });
  const stale = await runStop({
    cwd: project,
    tool_count: 10,
    stop_hook_active: false,
    session_id: "session-c",
    transcript_path: transcript
  });
  assert.equal(stale, "");
  const [contextFile] = await readdir(join(project, ".skillloom", "context"));
  const refreshed = JSON.parse(await readFile(join(project, ".skillloom", "context", contextFile), "utf8"));
  assert.equal(refreshed.source, "stop-refresh");
  assert.equal(refreshed.issuedToolCount, 10);

  const manual = await tempDir("skillloom-hook-manual-");
  const manualStale = await runStop({
    cwd: manual,
    tool_count: 1,
    stop_hook_active: false,
    session_id: "manual-session"
  });
  assert.equal(manualStale, "");
  const [manualContextFile] = await readdir(join(manual, ".skillloom", "context"));
  const manualRefreshed = JSON.parse(await readFile(join(manual, ".skillloom", "context", manualContextFile), "utf8"));
  assert.equal(manualRefreshed.source, "stop-refresh");
  assert.equal(manualRefreshed.issuedToolCount, 1);
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

async function toolTranscript(project: string, names: string[]): Promise<string> {
  const path = join(project, "transcript.jsonl");
  const source = names
    .map((name, index) => JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", id: `tool-${index}`, name }] } }))
    .join("\n");
  await writeFile(path, `${source}\n`);
  return path;
}

async function runSessionStart(input: object): Promise<string> {
  return await runHook("session-start.mjs", JSON.stringify(input));
}

async function runStop(input: object): Promise<string> {
  return await runStopSource(JSON.stringify(input));
}

async function runStopSource(input: string): Promise<string> {
  return await runHook("stop.mjs", input);
}

async function runHook(script: string, input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "hooks", script)], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: root }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 && stderr === "" ? resolve(stdout.trim()) : reject(new Error(stderr || `exit ${code}`)));
    child.stdin.end(input);
  });
}
