import { access } from "node:fs/promises";
import { join } from "node:path";
import { rollbackCommand } from "../commands/rollback.js";
import { setMode } from "../config/service.js";
import type { createEvaluationBrainRuntime } from "../evaluation/brain-runtime.js";
import { governWorkflowUpdate } from "../learning/workflow-governance.js";
import {
  demoAgentA,
  demoAgentB,
  demoReplayProof,
  demoWorkflowCapture
} from "./scenario.js";
import type { DemoCheck } from "./types.js";

type EvaluationRuntime = Awaited<ReturnType<typeof createEvaluationBrainRuntime>>;

export async function runDemoChecks(
  runtime: EvaluationRuntime,
  projectRoot: string,
  homeDir: string
): Promise<DemoCheck[]> {
  const workflow = await runtime.runAs(demoAgentA, async () => {
    const actor = runtime.actor(demoAgentA);
    const captured = await runtime.brain.capture(demoWorkflowCapture(actor));
    return await runtime.brain.read({ actor, artifactId: captured.artifact.id });
  });
  const retrieved = await runtime.runAs(demoAgentB, async () => await runtime.brain.retrieve({
    actor: runtime.actor(demoAgentB),
    query: "stale Docker build",
    tier: "quick",
    limit: 5
  }));
  assertDemo(retrieved.results[0]?.id === workflow.id, "Agent B did not retrieve Agent A's workflow");
  const checks: DemoCheck[] = [{
    name: "cross-agent-retrieval",
    status: "passed",
    evidence: `${workflow.id} ranked first for agent B`
  }];
  const input = {
    projectRoot,
    homeDir,
    brain: runtime.brain,
    actorId: demoAgentB,
    workflowArtifactId: workflow.id,
    action: "create" as const
  };

  const draft = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-missing-proof"
  }));
  assertDemo(draft.status === "draft", "Workflow without proof did not stay a draft");
  checks.push({
    name: "missing-proof-stays-draft",
    status: "passed",
    evidence: draft.reason
  });

  const failed = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-failed-proof",
    proof: demoReplayProof(workflow, "failed")
  }));
  assertDemo(failed.status === "rejected", "Failed verifier proof was not rejected");
  checks.push({
    name: "failed-proof-is-rejected",
    status: "passed",
    evidence: failed.reason
  });

  await setMode(projectRoot, "manual");
  const blocked = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-manual-promotion",
    proof: demoReplayProof(workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  }));
  assertDemo(blocked.status === "rejected", "Manual mode did not block policy promotion");
  checks.push({
    name: "manual-mode-blocks-promotion",
    status: "passed",
    evidence: blocked.reason
  });

  await setMode(projectRoot, "policy");
  const promoted = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-policy-promotion",
    proof: demoReplayProof(workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  }));
  assertDemo(promoted.status === "promoted", "Policy mode did not promote the proved workflow");
  const destination = join(projectRoot, ".agents", "skills", promoted.candidate.metadata.name, "SKILL.md");
  await access(destination);
  checks.push({
    name: "policy-mode-promotes",
    status: "passed",
    evidence: `${promoted.candidate.candidateId} installed after proof and policy approval`
  });

  const rolledBack = await rollbackCommand({
    command: "rollback",
    promotionId: promoted.promotion.promotionId,
    yes: true,
    force: false,
    json: true
  }, projectRoot);
  assertDemo(rolledBack.result === "rolled-back", "Promotion rollback did not complete");
  assertDemo(!await exists(destination), "Rolled-back skill is still installed");
  checks.push({
    name: "rollback-removes-skill",
    status: "passed",
    evidence: `${promoted.promotion.promotionId} restored the pre-promotion state`
  });
  return checks;
}

function assertDemo(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  return await access(path).then(() => true, () => false);
}
