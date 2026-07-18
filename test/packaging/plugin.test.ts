import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("repository plugin validator passes", async () => {
  const { stdout, stderr } = await execute(process.execPath, [join(root, "scripts/validate-plugin.mjs")], { cwd: root });
  assert.equal(stderr, "");
  assert.match(stdout, /validation passed/u);
});

test("SessionStart emits a safe static context when skill metadata is unavailable", async () => {
  const missingRoot = await mkdtemp(join(tmpdir(), "skillloom-hook-missing-"));
  try {
    const { stdout, stderr } = await execute(process.execPath, [join(root, "hooks/session-start.mjs")], {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: missingRoot }
    });
    const output = JSON.parse(stdout) as { hookSpecificOutput: { additionalContext: string } };
    assert.equal(stderr, "");
    assert.match(output.hookSpecificOutput.additionalContext, /\$capture-learning/u);
    assert.match(output.hookSpecificOutput.additionalContext, /manual mode/u);
  } finally {
    await rm(missingRoot, { recursive: true, force: true });
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
    "dist/cli/main.js",
    "skills/autonomous-learning/SKILL.md",
    "skills/autonomous-learning/agents/openai.yaml",
    "skills/capture-learning/SKILL.md",
    "skills/capture-learning/agents/openai.yaml",
    "skills/curate-skills/SKILL.md",
    "skills/curate-skills/agents/openai.yaml",
    "README.md",
    "LICENSE"
  ]) {
    assert.equal(paths.has(path), true, `${path} must be packed`);
  }
  assert.equal([...paths].some((path) => path.startsWith("src/") || path.startsWith("test/")), false);
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
