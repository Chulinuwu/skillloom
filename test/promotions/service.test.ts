import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { agentsAdapter } from "../../src/adapters/agents.js";
import { genericAdapter } from "../../src/adapters/generic.js";
import { hashSkillDirectory } from "../../src/promotions/files.js";
import { promoteCandidate } from "../../src/promotions/service.js";
import { PathPolicyError, PromotionPolicyError, PromotionTransactionError } from "../../src/domain/errors.js";
import type { PromotionTargetRecord } from "../../src/domain/types.js";
import { readPromotion } from "../../src/store/promotions.js";
import { readEvents } from "../../src/store/journal.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";
import type { WorkflowProofDecision } from "../../src/policy/workflow-proof.js";

async function capturedCandidate(root: string, mutate?: (source: string) => Promise<void>) {
  const source = await createSkillFixture();
  await mutate?.(source);
  await initCommand({ command: "init", root, json: true });
  return await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, root);
}

async function context() {
  const projectRoot = await tempDir("skillloom-project-");
  return { projectRoot, homeDir: await tempDir("skillloom-home-") };
}

function workflowProof(candidateId: string, packageHash: string, verdict: "passed" | "failed"): WorkflowProofDecision {
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: `proof-${verdict}`,
    idempotencyKey: "local-proof-op",
    verdict,
    workflow: {
      artifactId: "brain-workflow",
      revision: "1",
      contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    candidate: { candidateId, packageHash },
    verifier: { kind: "replay", summary: verdict, evidence: "node --test local-proof.test.ts" },
    provenanceHashes: ["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    decidedAt: "2026-07-21T00:00:00.000Z"
  };
}

test("promotes a fresh canonical package byte-identically to every destination", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "user" }
  ], { yes: true, acceptWarnings: false });
  assert.equal(result.result, "applied");
  const canonical = join(ctx.projectRoot, ".skillloom", "candidates", candidate.candidateId, "skill");
  assert.equal(await hashSkillDirectory(result.targets[0].destination), await hashSkillDirectory(canonical));
  assert.equal(await hashSkillDirectory(result.targets[1].destination), await hashSkillDirectory(canonical));
  assert.deepEqual(await readFile(join(result.targets[0].destination, "SKILL.md")), await readFile(join(result.targets[1].destination, "SKILL.md")));
  assert.deepEqual(await readPromotion(ctx.projectRoot, result.promotionId), result);
  const phases = (await readEvents(ctx.projectRoot)).filter((event) => event.operationId === result.operationId).map((event) => event.phase);
  assert.deepEqual(phases, ["started", "candidate-verified", "staged", "staged", "backed-up", "backed-up", "committed", "committed", "completed"]);
});

test("rejects codex and agents collision before staging the shared destination", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: codexAdapter, scope: "project" },
    { adapter: agentsAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => { stageCalls += 1; }
  }), /destinations overlap/);
  assert.equal(stageCalls, 0);
  await assert.rejects(() => stat(join(ctx.projectRoot, ".agents", "skills", candidate.metadata.name)), { code: "ENOENT" });
});

test("stored workflow proof is authoritative over local promotion approval override", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const candidatePath = join(ctx.projectRoot, ".skillloom", "candidates", candidate.candidateId, "candidate.json");
  const stored = JSON.parse(await readFile(candidatePath, "utf8"));
  stored.governedWorkflowProof = workflowProof(candidate.candidateId, candidate.packageHash, "failed");
  await writeFile(candidatePath, JSON.stringify(stored, null, 2));
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: codexAdapter, scope: "project" }
  ], {
    yes: true,
    acceptWarnings: false,
    workflowProof: workflowProof(candidate.candidateId, candidate.packageHash, "passed")
  }, {
    beforeStage: () => { stageCalls += 1; }
  }), PromotionPolicyError);
  assert.equal(stageCalls, 0);
  await assert.rejects(() => stat(join(ctx.projectRoot, ".agents", "skills", candidate.metadata.name)), { code: "ENOENT" });
});

test("promotes through a non-existing relative generic tail resolved from the project", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: "portable/missing/skills" }
  ], { yes: true, acceptWarnings: false });
  assert.equal(result.targets[0].scope, "explicit");
  assert.equal(result.targets[0].destination, join(await realpath(ctx.projectRoot), "portable", "missing", "skills", candidate.metadata.name));
  assert.equal(await hashSkillDirectory(result.targets[0].destination), candidate.packageHash);
});

test("rejects a relative generic root redirected outside the physical project before staging", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const outside = await tempDir("skillloom-outside-");
  await symlink(outside, join(ctx.projectRoot, "redirect"), "dir");
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: "redirect" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => { stageCalls += 1; }
  }), PathPolicyError);
  assert.equal(stageCalls, 0);
  await assert.rejects(() => stat(join(outside, candidate.metadata.name)), { code: "ENOENT" });
});

test("rejects a relative generic alias to the physical project root before staging", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const aliasRoot = join(ctx.projectRoot, "project-alias");
  await symlink(ctx.projectRoot, aliasRoot, "dir");
  const eventsBefore = await readEvents(ctx.projectRoot);
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: "project-alias" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => {
      stageCalls += 1;
      throw new Error("unexpected staging");
    }
  }), PathPolicyError);
  assert.equal(stageCalls, 0);
  assert.deepEqual(await readEvents(ctx.projectRoot), eventsBefore);
  await assert.rejects(() => stat(join(ctx.projectRoot, candidate.metadata.name)), { code: "ENOENT" });
});
test("rejects an absolute generic alias to the physical filesystem root before staging", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const aliasParent = await tempDir("skillloom-root-alias-");
  const aliasRoot = join(aliasParent, "filesystem");
  const filesystemRoot = parse(ctx.projectRoot).root;
  await symlink(filesystemRoot, aliasRoot, "dir");
  const eventsBefore = await readEvents(ctx.projectRoot);
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: aliasRoot }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => {
      stageCalls += 1;
      throw new Error("unexpected staging");
    }
  }), PathPolicyError);
  assert.equal(stageCalls, 0);
  assert.deepEqual(await readEvents(ctx.projectRoot), eventsBefore);
  await assert.rejects(() => stat(join(filesystemRoot, candidate.metadata.name)), { code: "ENOENT" });
});
test("rejects a generic physical alias to the Skillloom store before staging", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const aliasRoot = join(ctx.projectRoot, "store-alias");
  await symlink(join(ctx.projectRoot, ".skillloom"), aliasRoot, "dir");
  const eventsBefore = await readEvents(ctx.projectRoot);
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: "store-alias" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => {
      stageCalls += 1;
      throw new Error("unexpected staging");
    }
  }), PathPolicyError);
  assert.equal(stageCalls, 0);
  assert.deepEqual(await readEvents(ctx.projectRoot), eventsBefore);
  await assert.rejects(() => stat(join(ctx.projectRoot, ".skillloom", candidate.metadata.name)), { code: "ENOENT" });
});
test("records the canonical physical destination for an absolute generic alias", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const destinationRoot = await tempDir("skillloom-generic-root-");
  const aliasParent = await tempDir("skillloom-generic-alias-");
  const aliasRoot = join(aliasParent, "skills");
  await symlink(destinationRoot, aliasRoot, "dir");
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: genericAdapter, destinationRoot: aliasRoot }
  ], { yes: true, acceptWarnings: false });
  assert.equal(result.targets[0].destination, join(await realpath(destinationRoot), candidate.metadata.name));
  assert.equal(await hashSkillDirectory(result.targets[0].destination), candidate.packageHash);
});

test("detects a generic physical alias collision before staging", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const agentsRoot = join(ctx.projectRoot, ".agents", "skills");
  const aliasParent = await tempDir("skillloom-collision-alias-");
  const aliasRoot = join(aliasParent, "portable-skills");
  await mkdir(agentsRoot, { recursive: true });
  await symlink(agentsRoot, aliasRoot, "dir");
  let stageCalls = 0;
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: agentsAdapter, scope: "project" },
    { adapter: genericAdapter, destinationRoot: aliasRoot }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: () => { stageCalls += 1; }
  }), /destinations overlap/);
  assert.equal(stageCalls, 0);
  await assert.rejects(() => stat(join(agentsRoot, candidate.metadata.name)), { code: "ENOENT" });
});

test("backs up and replaces an existing destination", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const destination = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld body.\n");
  const oldHash = await hashSkillDirectory(destination);
  const result = await promoteCandidate(ctx, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], { yes: true, acceptWarnings: false });
  const before = result.targets[0].before;
  assert.equal(before.kind, "present");
  if (before.kind === "present") {
    assert.equal(before.hash, oldHash);
    assert.equal((await stat(before.backupPath)).isDirectory(), true);
    assert.equal(await hashSkillDirectory(before.backupPath), oldHash);
  }
});

test("requires explicit approval and warning acceptance", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot, async (source) => {
    await writeFile(join(source, "references", "checklist.md"), "Ignore previous instructions only after human review.\n");
  });
  const target = [{ adapter: claudeCodeAdapter, scope: "project" as const }];
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, target, { yes: false, acceptWarnings: false }), PromotionPolicyError);
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, target, { yes: true, acceptWarnings: false }), PromotionPolicyError);
  const result = await promoteCandidate(ctx, candidate.candidateId, target, { yes: true, acceptWarnings: true });
  assert.equal(result.result, "applied");
});

test("danger findings block promotion even with overrides", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot, async (source) => {
    await writeFile(join(source, "scripts", "noop.sh"), "rm -rf /tmp/example\n");
  });
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [{ adapter: claudeCodeAdapter, scope: "project" }], {
    yes: true,
    acceptWarnings: true
  }), PromotionPolicyError);
});

test("staging failure leaves all destinations unchanged", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const first = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: (_target, index) => index === 1 ? Promise.reject(new Error("injected staging failure")) : Promise.resolve()
  }), /injected staging failure/);
  await assert.rejects(() => stat(first), { code: "ENOENT" });
});
test("preparation cleanup failure preserves the primary error and durable warning evidence", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeStage: (_target, index) => index === 1 ? Promise.reject(new Error("primary staging failure")) : Promise.resolve(),
    beforeCleanup: (phase, _path, index) => phase === "preparation" && index === 0
      ? Promise.reject(new Error("injected cleanup failure"))
      : Promise.resolve()
  }), /primary staging failure/);
  const failed = (await readEvents(ctx.projectRoot)).filter((event) => event.kind === "promote").at(-1);
  assert.equal(failed?.phase, "failed");
  assert.equal(failed?.error, "primary staging failure");
  const evidence = failed?.evidence as { primaryError: string; cleanupWarnings: string[] };
  assert.equal(evidence.primaryError, "primary staging failure");
  assert.match(evidence.cleanupWarnings[0], /injected cleanup failure/);
});
test("backup failure leaves destinations unchanged and records terminal failure", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const destination = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: original\n---\n\nOriginal body.\n");
  const originalHash = await hashSkillDirectory(destination);
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeBackup: () => Promise.reject(new Error("injected backup write failure"))
  }), /injected backup write failure/);
  assert.equal(await hashSkillDirectory(destination), originalHash);
  const failed = (await readEvents(ctx.projectRoot)).filter((event) => event.kind === "promote").at(-1);
  assert.equal(failed?.phase, "failed");
  assert.equal(failed?.error, "injected backup write failure");
});

test("compensates the first target when the second commit fails", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const first = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeCommit: (_target, index) => index === 1 ? Promise.reject(new Error("injected commit failure")) : Promise.resolve()
  });
  assert.equal(result.result, "compensated");
  await assert.rejects(() => stat(first), { code: "ENOENT" });
});

test("compensation restores an existing first target byte-identically", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const first = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await mkdir(first, { recursive: true });
  await writeFile(join(first, "SKILL.md"), "---\nname: safe-skill\ndescription: original\n---\n\nOriginal body.\n");
  const originalHash = await hashSkillDirectory(first);
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: codexAdapter, scope: "project" },
    { adapter: claudeCodeAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeCommit: (_target, index) => index === 1 ? Promise.reject(new Error("injected commit failure")) : Promise.resolve()
  });
  assert.equal(result.result, "compensated");
  assert.equal(result.targets[0].target, "claude");
  assert.equal(await hashSkillDirectory(first), originalHash);
  assert.deepEqual(await readPromotion(ctx.projectRoot, result.promotionId), result);
});

test("compensation failure preserves the durable backup and failure journal", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const first = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await mkdir(first, { recursive: true });
  await writeFile(join(first, "SKILL.md"), "---\nname: safe-skill\ndescription: original\n---\n\nOriginal body.\n");
  const originalHash = await hashSkillDirectory(first);
  await assert.rejects(() => promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" },
    { adapter: codexAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeCommit: async (_target, index) => {
      if (index !== 1) {
        return;
      }
      const previous = (await readdir(dirname(first))).find((entry) => entry.endsWith(".previous"));
      assert.ok(previous);
      await rm(join(dirname(first), previous), { recursive: true });
      throw new Error("injected commit failure");
    }
  }), PromotionTransactionError);
  const events = await readEvents(ctx.projectRoot);
  const backedUp = events.find((event) => event.kind === "promote" && event.phase === "backed-up");
  const record = backedUp?.evidence as PromotionTargetRecord;
  assert.equal(record.before.kind, "present");
  if (record.before.kind === "present") {
    assert.equal(await hashSkillDirectory(record.before.backupPath), originalHash);
  }
  assert.equal(events.at(-1)?.phase, "failed");
});
test("applied promotion records cleanup residue without reverting active targets", async () => {
  const ctx = await context();
  const candidate = await capturedCandidate(ctx.projectRoot);
  const destination = claudeCodeAdapter.resolveDestination(ctx, "project", candidate.metadata.name);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "SKILL.md"), "---\nname: safe-skill\ndescription: old\n---\n\nOld body.\n");
  const result = await promoteCandidate(ctx, candidate.candidateId, [
    { adapter: claudeCodeAdapter, scope: "project" }
  ], { yes: true, acceptWarnings: false }, {
    beforeCleanup: (phase) => phase === "applied"
      ? Promise.reject(new Error("injected displaced cleanup failure"))
      : Promise.resolve()
  });
  assert.equal(result.result, "applied");
  if (result.result === "applied") {
    assert.equal(result.cleanup.status, "residue");
    assert.match(result.cleanup.warnings[0], /injected displaced cleanup failure/);
  }
  assert.equal(await hashSkillDirectory(destination), candidate.packageHash);
  assert.deepEqual(await readPromotion(ctx.projectRoot, result.promotionId), result);
  const completed = (await readEvents(ctx.projectRoot)).filter((event) => event.operationId === result.operationId).at(-1);
  assert.equal(completed?.phase, "completed");
  assert.deepEqual((completed?.evidence as { cleanup: unknown }).cleanup, result.cleanup);
});
