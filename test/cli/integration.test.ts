import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const builtCli = join(repositoryRoot, "dist", "cli", "main.js");

test("built CLI promotes byte-identical packages to Claude and Codex in isolated project and user scopes", async () => {
  const projectRoot = await tempDir("skillloom-e2e-project-");
  const homeDir = await tempDir("skillloom-e2e-home-");
  const binDir = await tempDir("skillloom-e2e-bin-");
  const source = await createSkillFixture();
  for (const executable of ["claude", "codex"]) {
    const path = join(binDir, executable);
    await writeFile(path, "#!/bin/sh\nexit 0\n");
    await chmod(path, 0o755);
  }

  await runCli(projectRoot, homeDir, ["init", "--json"]);
  const capture = await runCli(projectRoot, homeDir, ["capture", source, "--json"]);
  const candidate = JSON.parse(capture.stdout);
  const projectPromotion = await runCli(projectRoot, homeDir, [
    "promote",
    candidate.candidateId,
    "--target",
    "codex,claude,codex",
    "--scope",
    "project",
    "--yes",
    "--json"
  ]);
  const humanPromotion = await runCli(projectRoot, homeDir, [
    "promote",
    candidate.candidateId,
    "--target",
    "agents",
    "--scope",
    "user",
    "--yes"
  ]);
  const userPromotion = await runCli(projectRoot, homeDir, [
    "promote",
    candidate.candidateId,
    "--target",
    "claude,codex",
    "--scope",
    "user",
    "--yes",
    "--json"
  ]);

  assert.equal(JSON.parse(projectPromotion.stdout).result, "applied");
  assert.equal(JSON.parse(userPromotion.stdout).result, "applied");
  assert.match(humanPromotion.stdout.trim(), /^promo-[a-f0-9-]+ applied 1 target\(s\)$/);
  const destinations = [
    join(projectRoot, ".claude", "skills", "safe-skill"),
    join(projectRoot, ".agents", "skills", "safe-skill"),
    join(homeDir, ".claude", "skills", "safe-skill"),
    join(homeDir, ".agents", "skills", "safe-skill")
  ];
  for (const destination of destinations) {
    await assertPackagesEqual(source, destination);
  }

  const doctorJson = await runCli(projectRoot, homeDir, ["doctor", "--target", "claude,codex", "--json"], binDir);
  const report = JSON.parse(doctorJson.stdout);
  assert.equal(report.command, "doctor");
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.checks.filter((check: { kind: string }) => check.kind === "runtime").length, 2);
  const installed = report.checks.filter((check: { kind: string }) => check.kind === "installed-skill");
  assert.equal(installed.length, 4);
  assert.ok(installed.every((check: { state: string; packageHash: string }) => check.state === "valid" && check.packageHash === candidate.packageHash));

  const doctorHuman = await runCli(projectRoot, homeDir, ["doctor", "--target", "claude,codex"], binDir);
  assert.match(doctorHuman.stdout, /^doctor: 10 ok, 0 warning\(s\)$/m);
  assert.match(doctorHuman.stdout, /\[ok\] claude runtime .*\/claude: Claude Code CLI is executable/);
  assert.match(doctorHuman.stdout, /\[ok\] codex project skill safe-skill .* hash sha256-v2:[a-f0-9]{64}/);
});

test("built CLI supports portable agents and relative generic targets without real HOME writes", async () => {
  const projectRoot = await tempDir("skillloom-portable-project-");
  const homeDir = await tempDir("skillloom-portable-home-");
  const source = await createSkillFixture();
  await runCli(projectRoot, homeDir, ["init", "--json"]);
  const capture = JSON.parse((await runCli(projectRoot, homeDir, ["capture", source, "--json"])).stdout);
  const projectAgents = JSON.parse((await runCli(projectRoot, homeDir, [
    "promote", capture.candidateId, "--target", "agents", "--scope", "project", "--yes", "--json"
  ])).stdout);
  const userAgents = JSON.parse((await runCli(projectRoot, homeDir, [
    "promote", capture.candidateId, "--target", "agents", "--scope", "user", "--yes", "--json"
  ])).stdout);
  const generic = JSON.parse((await runCli(projectRoot, homeDir, [
    "promote", capture.candidateId, "--target", "generic", "--destination", "portable-skills", "--yes", "--json"
  ])).stdout);
  const projectAgentsDestination = join(projectRoot, ".agents", "skills", "safe-skill");
  const userAgentsDestination = join(homeDir, ".agents", "skills", "safe-skill");
  const genericDestination = join(projectRoot, "portable-skills", "safe-skill");
  assert.equal(projectAgents.targets[0].target, "agents");
  assert.equal(userAgents.targets[0].target, "agents");
  assert.equal(generic.targets[0].scope, "explicit");
  await assertPackagesEqual(source, projectAgentsDestination);
  await assertPackagesEqual(source, userAgentsDestination);
  await assertPackagesEqual(source, genericDestination);
  const doctor = JSON.parse((await runCli(projectRoot, homeDir, [
    "doctor", "--target", "agents", "--json"
  ], "")).stdout);
  assert.equal(doctor.checks.some((check: { kind: string }) => check.kind === "runtime"), false);
  assert.equal(doctor.checks.filter((check: { kind: string; state?: string }) => check.kind === "installed-skill" && check.state === "valid").length, 2);
  const genericDoctor = JSON.parse((await runCli(projectRoot, homeDir, [
    "doctor", "--target", "generic", "--destination", "portable-skills", "--json"
  ], "")).stdout);
  assert.equal(genericDoctor.checks.some((check: { kind: string }) => check.kind === "runtime"), false);
  assert.ok(genericDoctor.checks.some((check: { kind: string; state?: string }) => check.kind === "installed-skill" && check.state === "valid"));
});

test("built CLI rejects codex and agents collision without staging the shared path", async () => {
  const projectRoot = await tempDir("skillloom-collision-project-");
  const homeDir = await tempDir("skillloom-collision-home-");
  const source = await createSkillFixture();
  await runCli(projectRoot, homeDir, ["init", "--json"]);
  const capture = JSON.parse((await runCli(projectRoot, homeDir, ["capture", source, "--json"])).stdout);
  await assert.rejects(
    () => runCli(projectRoot, homeDir, [
      "promote", capture.candidateId, "--target", "codex,agents", "--scope", "project", "--yes", "--json"
    ]),
    (error: unknown) => error instanceof Error && /destinations overlap/.test(error.message)
  );
  await assert.rejects(() => stat(join(projectRoot, ".agents", "skills", "safe-skill")), { code: "ENOENT" });
});

test("built setup is explicit local-only, offline-safe, and idempotent with no harness CLIs", async () => {
  const projectRoot = await tempDir("skillloom-setup-project-");
  const homeDir = await tempDir("skillloom-setup-home-");
  await assert.rejects(
    () => runCli(projectRoot, homeDir, ["setup", "--target", "auto", "--hub", "auto", "--scope", "user", "--yes", "--json"], ""),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === 2
      && /--hub local/.test(error.message)
  );
  const first = JSON.parse((await runCli(projectRoot, homeDir, [
    "setup", "--target", "auto", "--hub", "local", "--scope", "user", "--yes", "--json"
  ], "")).stdout);
  assert.equal(first.hub.mode, "local-only");
  assert.deepEqual(first.targets.map(({ target, status }: { target: string; status: string }) => [target, status]), [
    ["claude", "not-detected"],
    ["codex", "not-detected"],
    ["agents", "installed"]
  ]);
  const second = JSON.parse((await runCli(projectRoot, homeDir, ["setup", "--hub", "local", "--scope", "user", "--yes", "--json"], "")).stdout);
  assert.equal(second.targets.find(({ target }: { target: string }) => target === "agents").status, "unchanged");
  await stat(join(homeDir, ".agents", "skills", "capture-learning", "SKILL.md"));
  const state = JSON.parse(await readFile(join(homeDir, ".skillloom", "hub", "setup.json"), "utf8"));
  assert.equal(state.completed["agents:user"].packageVersion, "0.3.8");
});

test("built CLI runs the isolated trust-boundary demo without writing to HOME", async () => {
  const projectRoot = await tempDir("skillloom-demo-project-");
  const homeDir = await tempDir("skillloom-demo-home-");
  const result = JSON.parse((await runCli(projectRoot, homeDir, ["demo", "--json"], "")).stdout);
  assert.equal(result.command, "demo");
  assert.equal(result.summary.failed, 0);
  assert.equal(result.workspaceRetained, false);
  await assert.rejects(() => stat(result.workspace), { code: "ENOENT" });
});

async function runCli(projectRoot: string, homeDir: string, args: string[], path = process.env.PATH ?? "") {
  return await execFileAsync(process.execPath, [builtCli, ...args], {
    cwd: projectRoot,
    env: { ...process.env, HOME: homeDir, PATH: path }
  });
}

async function assertPackagesEqual(source: string, destination: string): Promise<void> {
  for (const relativePath of ["SKILL.md", "references/checklist.md", "scripts/noop.sh"]) {
    assert.deepEqual(await readFile(join(destination, relativePath)), await readFile(join(source, relativePath)));
  }
}
