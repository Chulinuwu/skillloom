import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { statusCommand } from "../../src/commands/status.js";
import { hashSkillDirectory } from "../../src/promotions/files.js";
import { promoteCandidate } from "../../src/promotions/service.js";
import { resumePromotion } from "../../src/promotions/resume.js";
import { listOperations } from "../../src/store/operations.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";

async function setup() {
  const projectRoot = await tempDir("skillloom-crash-");
  const homeDir = await tempDir("skillloom-crash-home-");
  const source = await createSkillFixture();
  await initCommand({ command: "init", root: projectRoot, json: true });
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, projectRoot);
  return { projectRoot, homeDir, candidate };
}

test("real subprocess crash after promotion displace rename resumes from durable layout", async () => {
  const context = await setup();
  const destination = claudeCodeAdapter.resolveDestination(context, "project", context.candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld.\n");
  await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:destination-displaced-rename");
  const operation = (await listOperations(context.projectRoot)).find((item) => item.kind === "promote" && item.status !== "completed");
  assert.ok(operation);
  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.lock.state, "stale");
  assert.equal(status.recovery[0]?.recoveryCommand, `skillloom resume ${operation.operationId} --yes`);
  const result = await resumePromotion(context.projectRoot, operation.operationId, true);
  assert.equal(result.result, "applied");
  assert.equal(await hashSkillDirectory(destination), context.candidate.packageHash);
});

const promotionFreshBoundaries = [
  "displace-intent-checkpoint",
  "displaced-checkpoint",
  "install-intent-checkpoint",
  "stage-installed-rename",
  "installed-checkpoint"
];
const promotionReplacementBoundaries = [
  "displace-intent-checkpoint",
  "destination-displaced-rename",
  "displaced-checkpoint",
  "install-intent-checkpoint",
  "stage-installed-rename",
  "installed-checkpoint"
];
const rollbackFreshBoundaries = [
  "displace-intent-checkpoint",
  "destination-displaced-rename",
  "displaced-checkpoint",
  "install-intent-checkpoint",
  "installed-checkpoint"
];
const compensationFreshBoundaries = [
  "undo-install-intent-checkpoint",
  "destination-uninstalled-rename",
  "uninstalled-checkpoint",
  "undo-displace-intent-checkpoint",
  "restored-checkpoint"
];
const compensationReplacementBoundaries = [
  "undo-install-intent-checkpoint",
  "destination-uninstalled-rename",
  "uninstalled-checkpoint",
  "undo-displace-intent-checkpoint",
  "destination-restored-rename",
  "restored-checkpoint"
];
const rollbackFreshCompensationBoundaries = [
  "undo-install-intent-checkpoint",
  "uninstalled-checkpoint",
  "undo-displace-intent-checkpoint",
  "destination-restored-rename",
  "restored-checkpoint"
];

test("promotion resumes across every durable forward boundary", async (testContext) => {
  for (const boundary of promotionFreshBoundaries) {
    await testContext.test(`fresh ${boundary}`, async () => {
      await assertPromotionBoundary(`promotion:0:${boundary}`, false, false);
    });
  }
  for (const boundary of promotionReplacementBoundaries) {
    await testContext.test(`replacement ${boundary}`, async () => {
      await assertPromotionBoundary(`promotion:0:${boundary}`, true, false);
    });
  }
  for (const boundary of promotionReplacementBoundaries) {
    await testContext.test(`multi target ${boundary}`, async () => {
      await assertPromotionBoundary(`promotion:1:${boundary}`, true, true);
    });
  }
});

test("rollback resumes across every durable forward boundary", async (testContext) => {
  for (const boundary of rollbackFreshBoundaries) {
    await testContext.test(`fresh ${boundary}`, async () => {
      await assertRollbackBoundary(`rollback:0:${boundary}`, false, false);
    });
  }
  for (const boundary of promotionReplacementBoundaries) {
    await testContext.test(`replacement ${boundary}`, async () => {
      await assertRollbackBoundary(`rollback:0:${boundary}`, true, false);
    });
  }
  for (const boundary of promotionReplacementBoundaries) {
    await testContext.test(`multi target ${boundary}`, async () => {
      await assertRollbackBoundary(`rollback:1:${boundary}`, true, true);
    });
  }
});

test("promotion and rollback resume across every durable compensation boundary", async (testContext) => {
  for (const boundary of compensationFreshBoundaries) {
    await testContext.test(`promotion fresh ${boundary}`, async () => {
      await assertPromotionCompensationBoundary(`promotion:0:compensation:${boundary}`, false);
    });
  }
  for (const boundary of compensationReplacementBoundaries) {
    await testContext.test(`promotion replacement ${boundary}`, async () => {
      await assertPromotionCompensationBoundary(`promotion:0:compensation:${boundary}`, true);
    });
  }
  for (const boundary of rollbackFreshCompensationBoundaries) {
    await testContext.test(`rollback fresh ${boundary}`, async () => {
      await assertRollbackCompensationBoundary(`rollback:0:compensation:${boundary}`, false);
    });
  }
  for (const boundary of compensationReplacementBoundaries) {
    await testContext.test(`rollback replacement ${boundary}`, async () => {
      await assertRollbackCompensationBoundary(`rollback:0:compensation:${boundary}`, true);
    });
  }
});

test("promotion checks captured base path even when publishing elsewhere", async () => {
  const context = await setup();
  const base = await createSkillFixture();
  const source = await createSkillFixture(join(await tempDir(), "safe-skill"));
  const candidate = await captureCommand({ command: "capture", source, base, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  await writeFile(join(base, "references", "checklist.md"), "changed base\n");
  let staged = false;
  await assert.rejects(() => promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], {
    yes: true,
    acceptWarnings: false
  }, { beforeStage: () => { staged = true; } }), /base path hash mismatch/i);
  assert.equal(staged, false);
});

test("improvement resume validates the durable base-target layout", async (testContext) => {
  await testContext.test("resumes before candidate installation", async () => {
    const context = await setupImprovement("claude");
    await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:install-intent-checkpoint");
    const operation = await interruptedPromotion(context.projectRoot);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stdout).result, "applied");
    assert.equal(await hashSkillDirectory(context.base), context.candidate.packageHash);
  });

  await testContext.test("resumes after candidate installation", async () => {
    const context = await setupImprovement("claude");
    await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:stage-installed-rename");
    const operation = await interruptedPromotion(context.projectRoot);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stdout).result, "applied");
    assert.equal(await hashSkillDirectory(context.base), context.candidate.packageHash);
  });

  await testContext.test("rejects a changed base outside the promotion targets", async () => {
    const context = await setupImprovement("external");
    await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:stage-installed-rename");
    const operation = await interruptedPromotion(context.projectRoot);
    await writeFile(join(context.base, "references", "checklist.md"), "external edit\n");
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 6);
    assert.match(resumed.stderr, /base path hash mismatch/i);
    assert.equal(await hashSkillDirectory(operation.targets[0].destination), context.candidate.packageHash);
    await assert.rejects(() => stat(operation.targets[0].stagePath), { code: "ENOENT" });
  });

  await testContext.test("rejects a base edit before the recorded target mutation", async () => {
    const context = await setupImprovement("claude");
    await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:displace-intent-checkpoint");
    const operation = await interruptedPromotion(context.projectRoot);
    await writeFile(join(context.base, "references", "checklist.md"), "pre-mutation edit\n");
    const tamperedHash = await hashSkillDirectory(context.base);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 4);
    assert.match(resumed.stderr, /mutation layout mismatch/i);
    assert.equal(await hashSkillDirectory(context.base), tamperedHash);
    await assert.rejects(() => stat(operation.targets[0].displacedPath), { code: "ENOENT" });
  });

  await testContext.test("rejects destination tampering without restaging", async () => {
    const context = await setupImprovement("claude");
    await runCrashWorker("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:0:stage-installed-rename");
    const operation = await interruptedPromotion(context.projectRoot);
    await writeFile(join(context.base, "SKILL.md"), "---\nname: safe-skill\ndescription: tampered\n---\n\nTampered.\n");
    const tamperedHash = await hashSkillDirectory(context.base);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 4);
    assert.match(resumed.stderr, /mutation layout mismatch/i);
    assert.equal(await hashSkillDirectory(context.base), tamperedHash);
    await assert.rejects(() => stat(operation.targets[0].stagePath), { code: "ENOENT" });
  });

  await testContext.test("resumes when the base is the second target", async () => {
    const context = await setupImprovement("codex", true);
    await runCrashWorkerWithTargets("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, "promotion:1:stage-installed-rename", true);
    const operation = await interruptedPromotion(context.projectRoot);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stdout).result, "applied");
    for (const destination of promotionDestinations(context, true)) {
      assert.equal(await hashSkillDirectory(destination), context.candidate.packageHash);
    }
  });

  await testContext.test("resumes compensation while the base destination is displaced", async () => {
    const context = await setupImprovement("claude", true);
    const oldHash = await hashSkillDirectory(context.base);
    await runCrashWorkerWithTargets(
      "promote",
      context.projectRoot,
      context.homeDir,
      context.candidate.candidateId,
      "promotion:0:compensation:destination-uninstalled-rename",
      true,
      "compensate"
    );
    const operation = await interruptedPromotion(context.projectRoot);
    const resumed = await runBuiltResume(context.projectRoot, context.homeDir, operation.operationId);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.equal(JSON.parse(resumed.stdout).result, "compensated");
    assert.equal(await hashSkillDirectory(context.base), oldHash);
  });
});

async function runCrashWorker(mode: "promote" | "rollback", root: string, homeDir: string, recordId: string, boundary: string): Promise<void> {
  const worker = join(import.meta.dirname, "..", "helpers", "crash-worker.ts");
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", worker, mode, root, homeDir, recordId, boundary], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.signal, "SIGKILL");
}

async function setupImprovement(baseLocation: "claude" | "codex" | "external", multi = false) {
  const projectRoot = await tempDir("skillloom-improvement-");
  const homeDir = await tempDir("skillloom-improvement-home-");
  await initCommand({ command: "init", root: projectRoot, json: true });
  const destinations = [
    join(projectRoot, ".claude", "skills", "safe-skill"),
    join(projectRoot, ".agents", "skills", "safe-skill")
  ];
  if (multi) {
    await Promise.all(destinations.map((destination) => createSkillFixture(destination)));
  }
  const base = baseLocation === "external"
    ? await createSkillFixture(join(await tempDir("skillloom-external-base-"), "safe-skill"))
    : await createSkillFixture(destinations[baseLocation === "claude" ? 0 : 1]);
  const source = await createSkillFixture(join(await tempDir("skillloom-improved-source-"), "safe-skill"));
  await writeFile(join(source, "references", "checklist.md"), "improved candidate\n");
  const candidate = await captureCommand({ command: "capture", source, base, createdBy: "agent", evidence: [], json: true }, projectRoot);
  return { projectRoot, homeDir, candidate, base };
}

async function interruptedPromotion(root: string) {
  const operation = (await listOperations(root)).find((item) => item.kind === "promote" && item.status !== "completed");
  assert.ok(operation);
  return operation;
}

async function runBuiltResume(root: string, homeDir: string, operationId: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const cli = join(process.cwd(), "dist", "cli", "main.js");
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "resume", operationId, "--yes", "--json"], {
      cwd: root,
      env: { ...process.env, HOME: homeDir },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function assertPromotionBoundary(boundary: string, replacement: boolean, multi: boolean): Promise<void> {
  const context = await setup();
  const destinations = promotionDestinations(context, multi);
  if (replacement) {
    await Promise.all(destinations.map(writeOldSkill));
  }
  await runCrashWorkerWithTargets("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, boundary, multi);
  const operation = (await listOperations(context.projectRoot)).find((item) => item.kind === "promote" && item.status !== "completed");
  assert.ok(operation);
  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.recovery[0]?.recoveryCommand, `skillloom resume ${operation.operationId} --yes`);
  const result = await resumePromotion(context.projectRoot, operation.operationId, true);
  assert.equal(result.result, "applied");
  for (const destination of destinations) {
    assert.equal(await hashSkillDirectory(destination), context.candidate.packageHash);
  }
}

async function assertRollbackBoundary(boundary: string, replacement: boolean, multi: boolean): Promise<void> {
  const context = await setup();
  const destinations = promotionDestinations(context, multi);
  const oldHashes = replacement ? await Promise.all(destinations.map(writeOldSkill)) : [];
  const targets = multi
    ? [{ adapter: claudeCodeAdapter, scope: "project" as const }, { adapter: codexAdapter, scope: "project" as const }]
    : [{ adapter: claudeCodeAdapter, scope: "project" as const }];
  const promotion = await promoteCandidate(context, context.candidate.candidateId, targets, { yes: true, acceptWarnings: false });
  await runCrashWorker("rollback", context.projectRoot, context.homeDir, promotion.promotionId, boundary);
  const operation = (await listOperations(context.projectRoot)).find((item) => item.kind === "rollback" && item.status !== "completed");
  assert.ok(operation);
  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.recovery[0]?.recoveryCommand, `skillloom resume ${operation.operationId} --yes`);
  const result = await resumePromotion(context.projectRoot, operation.operationId, true);
  assert.equal(result.result, "rolled-back");
  for (const [index, destination] of destinations.entries()) {
    if (replacement) {
      assert.equal(await hashSkillDirectory(destination), oldHashes[index]);
    } else {
      await assert.rejects(() => stat(destination), { code: "ENOENT" });
    }
  }
}

function promotionDestinations(context: Awaited<ReturnType<typeof setup>>, multi: boolean): string[] {
  const destinations = [claudeCodeAdapter.resolveDestination(context, "project", context.candidate.metadata.name)];
  if (multi) {
    destinations.push(codexAdapter.resolveDestination(context, "project", context.candidate.metadata.name));
  }
  return destinations;
}

async function writeOldSkill(destination: string): Promise<string> {
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld.\n");
  return await hashSkillDirectory(destination);
}

async function runCrashWorkerWithTargets(
  mode: "promote" | "rollback",
  root: string,
  homeDir: string,
  recordId: string,
  boundary: string,
  multi: boolean,
  targetMode = multi ? "multi" : "single"
): Promise<void> {
  const worker = join(import.meta.dirname, "..", "helpers", "crash-worker.ts");
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", worker, mode, root, homeDir, recordId, boundary, targetMode], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.signal, "SIGKILL");
}

async function assertPromotionCompensationBoundary(boundary: string, replacement: boolean): Promise<void> {
  const context = await setup();
  const destinations = promotionDestinations(context, true);
  const oldHashes = replacement ? await Promise.all(destinations.map(writeOldSkill)) : [];
  await runCrashWorkerWithTargets("promote", context.projectRoot, context.homeDir, context.candidate.candidateId, boundary, true, "compensate");
  const operation = (await listOperations(context.projectRoot)).find((item) => item.kind === "promote" && item.status !== "completed");
  assert.ok(operation);
  const result = await resumePromotion(context.projectRoot, operation.operationId, true);
  assert.equal(result.result, "compensated");
  for (const [index, destination] of destinations.entries()) {
    if (replacement) {
      assert.equal(await hashSkillDirectory(destination), oldHashes[index]);
    } else {
      await assert.rejects(() => stat(destination), { code: "ENOENT" });
    }
  }
}

async function assertRollbackCompensationBoundary(boundary: string, replacement: boolean): Promise<void> {
  const context = await setup();
  const destinations = promotionDestinations(context, true);
  if (replacement) {
    await Promise.all(destinations.map(writeOldSkill));
  }
  const promotion = await promoteCandidate(context, context.candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false });
  await runCrashWorkerWithTargets("rollback", context.projectRoot, context.homeDir, promotion.promotionId, boundary, true, "compensate");
  const operation = (await listOperations(context.projectRoot)).find((item) => item.kind === "rollback" && item.status !== "completed");
  assert.ok(operation);
  const result = await resumePromotion(context.projectRoot, operation.operationId, true);
  assert.equal(result.result, "applied");
  for (const destination of destinations) {
    assert.equal(await hashSkillDirectory(destination), context.candidate.packageHash);
  }
}
