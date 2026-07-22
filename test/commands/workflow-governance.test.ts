import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { initCommand } from "../../src/commands/init.js";
import { rollbackCommand } from "../../src/commands/rollback.js";
import { setMode } from "../../src/config/service.js";
import { createBrainService, type BrainActor, type BrainArtifact, type BrainPermissionPort } from "../../src/hub/brain/index.js";
import { RegistryPublishBlockedError } from "../../src/hub/registry/server-errors.js";
import { workflowProofError } from "../../src/policy/workflow-proof.js";
import { governWorkflowUpdate } from "../../src/learning/workflow-governance.js";
import type { WorkflowVerifierProof } from "../../src/learning/workflow-governance-types.js";
import { listCandidates, readCandidate } from "../../src/store/candidates.js";
import { listLearningEvents } from "../../src/store/learning.js";
import { listPromotions, readPromotion } from "../../src/store/promotions.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";
import type { WorkflowBrainPort } from "../../src/learning/workflow-governance-types.js";

const actor: BrainActor = { actorId: "skillloom-test" };
const provenanceHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

class AllowAllBrainPermissions implements BrainPermissionPort {
  async requireRead(): Promise<void> {}
  async requireWrite(): Promise<void> {}
}

test("missing workflow verifier leaves a non-executable draft and creates no candidate", async () => {
  const harness = await createHarness("skillloom-workflow-draft-");
  const result = await governWorkflowUpdate({
    ...harness.input,
    operationId: "draft-op",
    action: "create"
  });
  assert.equal(result.status, "draft");
  assert.equal((await listCandidates(harness.projectRoot)).length, 0);
});

test("failed and unbound workflow verifiers reject without candidate and write rejected memory", async () => {
  const failed = await createHarness("skillloom-workflow-failed-");
  const failedResult = await governWorkflowUpdate({
    ...failed.input,
    operationId: "failed-op",
    action: "create",
    proof: proofFor(failed.workflow, "failed")
  });
  assert.equal(failedResult.status, "rejected");
  assert.equal((await listCandidates(failed.projectRoot)).length, 0);
  assert.equal((await failed.brain.list({ actor, type: "rejected-update" })).length, 1);
  assert.equal((await listLearningEvents(failed.projectRoot)).some((event) => /Rejected workflow update/u.test(event.summary)), true);

  const unbound = await createHarness("skillloom-workflow-unbound-");
  const unboundResult = await governWorkflowUpdate({
    ...unbound.input,
    operationId: "unbound-op",
    action: "create",
    proof: { ...proofFor(unbound.workflow, "passed"), workflow: { ...proofFor(unbound.workflow, "passed").workflow, revision: "0" } }
  });
  assert.equal(unboundResult.status, "rejected");
  assert.equal((await listCandidates(unbound.projectRoot)).length, 0);
  assert.equal((await unbound.brain.list({ actor, type: "rejected-update" })).length, 1);
});

test("rejected workflow retry replays partial Brain capture without idempotency conflict", async () => {
  const harness = await createHarness("skillloom-workflow-reject-retry-");
  let failFeedback = true;
  const flakyBrain: WorkflowBrainPort = {
    async read(input) {
      return await harness.brain.read(input);
    },
    async capture(input) {
      if (input.type === "feedback" && failFeedback) {
        failFeedback = false;
        throw new Error("feedback writer failed");
      }
      return await harness.brain.capture(input);
    }
  };
  const input = {
    ...harness.input,
    brain: flakyBrain,
    operationId: "reject-retry-op",
    action: "create",
    proof: proofFor(harness.workflow, "failed")
  };
  await assert.rejects(() => governWorkflowUpdate(input), /feedback writer failed/u);
  const result = await governWorkflowUpdate(input);
  assert.equal(result.status, "rejected");
  assert.equal((await harness.brain.list({ actor, type: "rejected-update" })).length, 1);
  assert.equal((await harness.brain.list({ actor, type: "feedback" })).length, 1);
});

test("passed replay creates one immutable candidate and retries reuse the same operation", async () => {
  const harness = await createHarness("skillloom-workflow-create-");
  const input = {
    ...harness.input,
    operationId: "create-op",
    action: "create",
    proof: proofFor(harness.workflow, "passed")
  };
  const first = await governWorkflowUpdate(input);
  const second = await governWorkflowUpdate(input);
  assert.equal(first.status, "candidate");
  assert.equal(second.status, "candidate");
  if (first.status !== "candidate" || second.status !== "candidate") return;
  assert.equal(first.candidate.candidateId, second.candidate.candidateId);
  assert.equal((await listCandidates(harness.projectRoot)).length, 1);
  assert.equal(first.candidate.state === "captured" || first.candidate.state === "blocked", true);
  const stored = await readCandidate(harness.projectRoot, first.candidate.candidateId);
  assert.equal(stored.governedWorkflowProof?.candidate.packageHash, first.candidate.packageHash);
});

test("workflow action/base mismatches are rejected before candidate capture", async () => {
  const missing = await createHarness("skillloom-workflow-missing-base-");
  const missingResult = await governWorkflowUpdate({
    ...missing.input,
    operationId: "missing-base-op",
    action: "patch",
    proof: proofFor(missing.workflow, "passed")
  });
  assert.equal(missingResult.status, "rejected");
  assert.equal((await listCandidates(missing.projectRoot)).length, 0);

  const create = await createHarness("skillloom-workflow-create-base-");
  const base = await createSkillFixture();
  const createResult = await governWorkflowUpdate({
    ...create.input,
    operationId: "create-base-op",
    action: "create",
    baseSkillPath: base,
    proof: proofFor(create.workflow, "passed")
  });
  assert.equal(createResult.status, "rejected");
  assert.equal((await listCandidates(create.projectRoot)).length, 0);
});

test("passed held-out proof captures bounded patch candidate", async () => {
  const harness = await createHarness("skillloom-workflow-patch-");
  const base = await createSkillFixture();
  const supportBefore = await readFile(join(base, "references", "checklist.md"), "utf8");
  const result = await governWorkflowUpdate({
    ...harness.input,
    operationId: "patch-op",
    action: "patch",
    baseSkillPath: base,
    proof: heldOutProofFor(harness.workflow)
  });
  assert.equal(result.status, "candidate");
  if (result.status !== "candidate") return;
  assert.equal(result.candidate.base.kind, "installed");
  const skillText = await readFile(join(harness.projectRoot, ".skillloom", "candidates", result.candidate.candidateId, "skill", "SKILL.md"), "utf8");
  assert.match(skillText, /Proven Workflow Update/u);
  assert.match(skillText, /8\. Step 8/u);
  assert.doesNotMatch(skillText, /9\. Step 9/u);
  const supportAfter = await readFile(join(harness.projectRoot, ".skillloom", "candidates", result.candidate.candidateId, "skill", "references", "checklist.md"), "utf8");
  assert.equal(supportAfter, supportBefore);
});

test("policy rejection happens before promotion staging", async () => {
  const harness = await createHarness("skillloom-workflow-policy-");
  await setMode(harness.projectRoot, "manual");
  const result = await governWorkflowUpdate({
    ...harness.input,
    operationId: "policy-op",
    action: "create",
    proof: proofFor(harness.workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  });
  assert.equal(result.status, "rejected");
  assert.equal((await listPromotions(harness.projectRoot)).length, 0);
  assert.deepEqual(await entries(join(harness.projectRoot, ".skillloom", "staging")), []);
});

test("successful promotion reuses promotion rollback and preserves proof provenance", async () => {
  const harness = await createHarness("skillloom-workflow-promote-");
  await setMode(harness.projectRoot, "policy");
  const result = await governWorkflowUpdate({
    ...harness.input,
    operationId: "promote-op",
    action: "create",
    proof: proofFor(harness.workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  });
  assert.equal(result.status, "promoted");
  if (result.status !== "promoted") return;
  assert.equal(result.candidate.governedWorkflowProof?.workflow.artifactId, harness.workflow.id);
  const rolledBack = await rollbackCommand({ command: "rollback", promotionId: result.promotion.promotionId, yes: true, force: false, json: true }, harness.projectRoot);
  assert.equal(rolledBack.result, "rolled-back");
  const stored = await readPromotion(harness.projectRoot, result.promotion.promotionId);
  assert.equal(stored.result, "rolled-back");
  assert.equal(stored.candidateId, result.candidate.candidateId);
});

test("registry publish proof gate rejects stale candidate binding", () => {
  const reason = workflowProofError({
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: "proof-one",
    idempotencyKey: "registry-op",
    verdict: "passed",
    workflow: { artifactId: "brain-workflow", revision: "1", contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    candidate: { candidateId: "candidate-one", packageHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
    verifier: { kind: "replay", summary: "passed", evidence: "node --test" },
    provenanceHashes: [provenanceHash],
    decidedAt: "2026-07-22T00:00:00.000Z"
  }, {
    candidateId: "candidate-two",
    packageHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }, [{ artifactId: "brain-workflow", revision: "1", contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }]);
  assert.equal(reason, "workflow proof is not bound to the candidate package");
  assert.equal(new RegistryPublishBlockedError(`candidate-two: ${reason}`).message.includes("candidate-two"), true);
});

async function createHarness(prefix: string) {
  const projectRoot = await tempDir(prefix);
  const homeDir = await tempDir(`${prefix}home-`);
  await initCommand({ command: "init", root: projectRoot, json: true });
  const brain = await createBrainService({ root: await tempDir(`${prefix}brain-`), permissions: new AllowAllBrainPermissions() });
  const captured = await brain.capture({
    actor,
    requestId: `${prefix}workflow`,
    type: "workflow",
    title: "Create Governed Workflow Skill",
    content: "A reusable workflow derived from proven episodes.",
    provenance: { provenanceHashes: [provenanceHash] },
    details: {
      kind: "workflow",
      trigger: "a proven workflow should become a skill",
      steps: Array.from({ length: 12 }, (_, index) => `Step ${index + 1}`),
      verifier: "replay",
      promotable: true
    },
    sensitivity: "tailnet"
  });
  const workflow = await brain.read({ actor, artifactId: captured.artifact.id });
  return {
    projectRoot,
    homeDir,
    brain,
    workflow,
    input: {
      projectRoot,
      homeDir,
      brain,
      actorId: actor.actorId,
      workflowArtifactId: workflow.id
    }
  };
}

function proofFor(workflow: BrainArtifact, status: "passed" | "failed"): WorkflowVerifierProof {
  return {
    kind: "replay",
    status,
    workflow: { artifactId: workflow.id, revision: workflow.revision, contentHash: workflow.contentHash },
    summary: status === "passed" ? "replay passed" : "replay failed",
    command: "node --test workflow-replay.test.ts",
    provenanceHashes: [provenanceHash]
  };
}

function heldOutProofFor(workflow: BrainArtifact): WorkflowVerifierProof {
  return {
    kind: "held-out-evaluation",
    status: "passed",
    workflow: { artifactId: workflow.id, revision: workflow.revision, contentHash: workflow.contentHash },
    summary: "held-out set passed",
    score: 0.95,
    threshold: 0.9,
    provenanceHashes: [provenanceHash]
  };
}

async function entries(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}
