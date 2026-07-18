import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { rollbackPromotion } from "../../src/promotions/rollback.js";
import { promoteCandidate } from "../../src/promotions/service.js";
import { resumePromotion } from "../../src/promotions/resume.js";
import { hashSkillDirectory } from "../../src/promotions/files.js";
import { statusCommand } from "../../src/commands/status.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { readOperation } from "../../src/store/operations.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";

async function setup() {
  const projectRoot = await tempDir("skillloom-recovery-");
  const homeDir = await tempDir("skillloom-home-");
  await initCommand({ command: "init", root: projectRoot, json: true });
  return { projectRoot, homeDir };
}

test("capture records only canonical base identity and blocks changed installed content", async () => {
  const context = await setup();
  const base = await createSkillFixture();
  const source = await createSkillFixture(join(await tempDir(), "safe-skill"));
  await writeFile(join(source, "references", "checklist.md"), "improved\n");
  const baseHash = await hashSkillDirectory(base);
  const candidate = await captureCommand({ command: "capture", source, base, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  assert.deepEqual(candidate.base, { kind: "installed", path: await realpath(base), hash: baseHash });
  const destination = claudeCodeAdapter.resolveDestination(context, "project", candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: concurrent edit\n---\n\nChanged.\n");
  let staged = false;
  await assert.rejects(() => promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], {
    yes: true,
    acceptWarnings: false
  }, { beforeStage: () => { staged = true; } }), /base hash mismatch/i);
  assert.equal(staged, false);
});

test("resumes an exact prepared promotion and is idempotent", async () => {
  const context = await setup();
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  let operationId = "";
  await assert.rejects(() => promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], {
    yes: true,
    acceptWarnings: false
  }, {
    afterCheckpoint: (checkpoint) => {
      operationId = checkpoint.operationId;
      if (checkpoint.phase === "prepared") {
        throw new Error("simulated interruption");
      }
    }
  }), /simulated interruption/);
  const result = await resumePromotion(context.projectRoot, operationId, true);
  assert.equal(result.result, "applied");
  assert.deepEqual(await resumePromotion(context.projectRoot, operationId, true), result);
});

test("resume rejects a changed stage without recreating it or mutating the destination", async () => {
  const context = await setup();
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  let operationId = "";
  await assert.rejects(() => promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], {
    yes: true,
    acceptWarnings: false
  }, {
    afterCheckpoint: (checkpoint) => {
      operationId = checkpoint.operationId;
      if (checkpoint.phase === "prepared") {
        throw new Error("simulated interruption");
      }
    }
  }));
  const operation = await readOperation(context.projectRoot, operationId);
  assert.equal(operation.kind, "promote");
  if (operation.kind !== "promote") {
    return;
  }
  await writeFile(join(operation.targets[0].stagePath, "references", "checklist.md"), "tampered\n");
  await assert.rejects(() => resumePromotion(context.projectRoot, operationId, true), /staged hash mismatch/i);
  await assert.rejects(() => stat(operation.targets[0].destination), { code: "ENOENT" });
});

test("rollback restores prior content, refuses conflicts, and is idempotent", async () => {
  const context = await setup();
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  const destination = claudeCodeAdapter.resolveDestination(context, "project", candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld.\n");
  const oldHash = await hashSkillDirectory(destination);
  const promotion = await promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], { yes: true, acceptWarnings: false });
  const rolledBack = await rollbackPromotion(context.projectRoot, promotion.promotionId, { yes: true, force: false });
  assert.equal(rolledBack.result, "rolled-back");
  assert.equal(await hashSkillDirectory(destination), oldHash);
  assert.deepEqual(await rollbackPromotion(context.projectRoot, promotion.promotionId, { yes: true, force: false }), rolledBack);
  await stat(destination);
});

test("rollback refuses active conflicts unless forced and removes a fresh install", async () => {
  const context = await setup();
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  const replacement = claudeCodeAdapter.resolveDestination(context, "project", candidate.metadata.name);
  await mkdir(replacement, { recursive: true });
  await writeFile(join(replacement, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld.\n");
  const oldHash = await hashSkillDirectory(replacement);
  const promotion = await promoteCandidate(context, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], { yes: true, acceptWarnings: false });
  await writeFile(join(replacement, "references", "checklist.md"), "newer work\n");
  const conflictHash = await hashSkillDirectory(replacement);
  await assert.rejects(() => rollbackPromotion(context.projectRoot, promotion.promotionId, { yes: true, force: false }), /active hash mismatch/i);
  assert.equal(await hashSkillDirectory(replacement), conflictHash);
  await rollbackPromotion(context.projectRoot, promotion.promotionId, { yes: true, force: true });
  assert.equal(await hashSkillDirectory(replacement), oldHash);

  const fresh = await promoteCandidate(context, candidate.candidateId, [{ adapter: codexAdapter, scope: "project" }], { yes: true, acceptWarnings: false });
  const freshDestination = fresh.targets[0].destination;
  await rollbackPromotion(context.projectRoot, fresh.promotionId, { yes: true, force: false });
  await assert.rejects(() => stat(freshDestination), { code: "ENOENT" });
});

test("multi-target rollback compensates prior targets in reverse order", async () => {
  const context = await setup();
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, context.projectRoot);
  const promotion = await promoteCandidate(context, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false });
  await assert.rejects(() => rollbackPromotion(context.projectRoot, promotion.promotionId, { yes: true, force: false }, {
    beforeCommit: (_destination, index) => index === 1 ? Promise.reject(new Error("injected rollback failure")) : Promise.resolve()
  }), /compensated/i);
  for (const target of promotion.targets) {
    assert.equal(await hashSkillDirectory(target.destination), target.afterHash);
  }
});

test("status reports incomplete operations and stale locks without removing them", async () => {
  const context = await setup();
  const lock = join(context.projectRoot, ".skillloom", "lock");
  await mkdir(lock);
  await writeFile(join(lock, "lock.json"), JSON.stringify({ pid: 2147483647, createdAt: "2000-01-01T00:00:00.000Z" }));
  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.lock.state, "stale");
  assert.match(status.lock.action, /inspect/i);
  await stat(lock);
});
