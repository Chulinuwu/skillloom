import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("repository plugin validator passes", async () => {
  const { stdout, stderr } = await execute(process.execPath, [join(root, "test/packaging/validate-plugin.mjs")], { cwd: root });
  assert.equal(stderr, "");
  assert.match(stdout, /validation passed/u);
});

test("SessionStart emits a safe static context when skill metadata is unavailable", async () => {
  const missingRoot = await mkdtemp(join(tmpdir(), "skillloom-hook-missing-"));
  try {
    const { stdout, stderr } = await executeHook("session-start.mjs", {
      cwd: missingRoot,
      session_id: "missing-metadata",
      source: "startup"
    }, {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: missingRoot
    });
    const output = JSON.parse(stdout) as { hookSpecificOutput: { additionalContext: string } };
    assert.equal(stderr, "");
    assert.match(output.hookSpecificOutput.additionalContext, /\$capture-learning/u);
    assert.match(output.hookSpecificOutput.additionalContext, /manual mode/u);
  } finally {
    await rm(missingRoot, { recursive: true, force: true });
  }
});
test("SessionStart emits bounded automatic recall context for Hermes", async () => {
  const project = await mkdtemp(join(tmpdir(), "skillloom-hook-hermes-"));
  try {
    await mkdir(join(project, ".skillloom"));
    await writeFile(join(project, ".skillloom", "config.json"), JSON.stringify({ mode: "hermes", hermes: { minToolCalls: 3 } }));
    const { stdout, stderr } = await executeHook("session-start.mjs", {
      cwd: project,
      session_id: "packaging-hermes",
      source: "startup"
    }, { ...process.env, CLAUDE_PLUGIN_ROOT: root });
    const output = JSON.parse(stdout) as { hookSpecificOutput: { additionalContext: string } };
    const context = output.hookSpecificOutput.additionalContext;
    assert.equal(stderr, "");
    assert.ok(context.length <= 500, `Hermes context is ${context.length} characters`);
    assert.match(context, /bounded Brain recall/u);
    assert.match(context, /high-confidence/u);
    assert.match(context, /Continue if Hub unavailable/u);
    assert.match(context, /Codex and agents require invocation/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
test("npm package contains the CLI and all portable skills", async () => {
  const { stdout, stderr } = await execute("npm", ["pack", "--json", "--dry-run", "--ignore-scripts"], {
    cwd: root,
    maxBuffer: 2 * 1024 * 1024
  });
  assert.equal(stderr, "");
  const [pack] = JSON.parse(stdout) as [{ files: Array<{ path: string }> }];
  const paths = new Set(pack.files.map((file) => file.path));
  for (const path of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "claude.mcp.json",
    "codex.mcp.json",
    "dist/cli/main.js",
    "plugin-runtime/skillloom.mjs",
    "hub/.env.example",
    "hub/Dockerfile",
    "hub/README.md",
    "hub/compose.yaml",
    "hub/policy.example.hujson",
    "hub/scripts/live-acceptance.sh",
    "hooks/hooks.json",
    "mode-profile.d.mts",
    "mode-profile.mjs",
    "skills/autonomous-learning/SKILL.md",
    "skills/autonomous-learning/agents/openai.yaml",
    "skills/capture-learning/SKILL.md",
    "skills/capture-learning/agents/openai.yaml",
    "skills/curate-skills/SKILL.md",
    "skills/curate-skills/agents/openai.yaml",
    "skills/skillloom/SKILL.md",
    "skills/skillloom/agents/openai.yaml",
    "skills/setup-skillloom/SKILL.md",
    "skills/setup-skillloom/agents/openai.yaml",
    "skills/setup-skillloom/scripts/skillloom.mjs",
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "LICENSE"
  ]) {
    assert.equal(paths.has(path), true, `${path} must be packed`);
  }
  assert.equal([...paths].some((path) => /(?:token|secret|credential|vault|database)\.(?:json|env)$/iu.test(path)), false);
  assert.equal([...paths].some((path) => path.startsWith("src/") || path.startsWith("test/")), false);
});

test("Git marketplace setup runner starts without the ignored dist directory", async () => {
  const snapshot = await mkdtemp(join(tmpdir(), "skillloom-marketplace-test-"));
  const runner = join(snapshot, "skills/setup-skillloom/scripts/skillloom.mjs");
  const runtime = join(snapshot, "plugin-runtime/skillloom.mjs");
  const workspace = join(snapshot, "workspace");
  try {
    await mkdir(dirname(runner), { recursive: true });
    await mkdir(dirname(runtime), { recursive: true });
    await mkdir(workspace);
    await copyFile(join(root, "skills/setup-skillloom/scripts/skillloom.mjs"), runner);
    await copyFile(join(root, "plugin-runtime/skillloom.mjs"), runtime);
    const { stdout, stderr } = await execute(process.execPath, [runner, "status", "--json"], { cwd: workspace });
    assert.equal(stderr, "");
    assert.equal((JSON.parse(stdout) as { mode: string }).mode, "manual");
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
});

test("npm package excludes runtime environment files and retains the Hub template", async () => {
  const fixture = await mkdtemp(join(root, "hub", "package-env-fixture-"));
  try {
    const candidates = [".env", ".env.local", ".env.production", ".env.secret", ".env.example", ".envrc", ".envrc.local"];
    await Promise.all(candidates.map((name) => writeFile(join(fixture, name), "SAFE_TEST_ONLY=1\n")));
    const { stdout, stderr } = await execute("npm", ["pack", "--json", "--dry-run", "--ignore-scripts"], {
      cwd: root,
      maxBuffer: 2 * 1024 * 1024
    });
    assert.equal(stderr, "");
    const [pack] = JSON.parse(stdout) as [{ files: Array<{ path: string }> }];
    const paths = new Set(pack.files.map((file) => file.path));
    const fixtureName = fixture.slice(join(root, "hub").length + 1);
    assert.equal(paths.has("hub/.env.example"), true);
    assert.equal(paths.has(".env"), false);
    assert.equal(paths.has("hub/.env"), false);
    for (const candidate of candidates) {
      assert.equal(paths.has(`hub/${fixtureName}/${candidate}`), false, `${candidate} must not be packed`);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
test("CLI starts when invoked through an npm-style bin symlink", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "skillloom-bin-test-"));
  const workspace = join(temporary, "workspace");
  const binary = join(temporary, "skillloom");
  try {
    await mkdir(workspace);
    await symlink(join(root, "dist/cli/main.js"), binary);
    const { stderr } = await execute(process.execPath, [binary, "init"], { cwd: workspace });
    assert.equal(stderr, "");
    await access(join(workspace, ".skillloom", "config.json"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

async function executeHook(script: string, input: object, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "hooks", script)], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `exit ${code}`)));
    child.stdin.end(JSON.stringify(input));
  });
}
