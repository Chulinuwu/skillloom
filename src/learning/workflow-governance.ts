import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getScopedAdapter } from "../adapters/registry.js";
import { ensureConfig } from "../config/service.js";
import type { CandidateBase, CandidateRecord } from "../domain/types.js";
import { ValidationError } from "../domain/errors.js";
import { withStoreLock } from "../files/lock.js";
import type { BrainArtifact } from "../hub/brain/types.js";
import { evaluateAutoPromotion } from "../policy/evaluate.js";
import type { WorkflowProofDecision } from "../policy/workflow-proof.js";
import { promoteCandidate } from "../promotions/service.js";
import { validateSkillPackage } from "../skills/validate.js";
import { createCandidateId, readCandidate, stateForFindings } from "../store/candidates.js";
import { commitCandidateSnapshot, discardCandidateSnapshot, stageCandidateSnapshot, type StagedCandidateSnapshot } from "../store/candidate-snapshot.js";
import { appendEvent } from "../store/journal.js";
import { writeLearningEvent } from "../store/learning.js";
import { boundedWorkflowSteps, writeWorkflowSkillPackage } from "./workflow-governance-package.js";
import type { GovernWorkflowInput, WorkflowGovernanceResult, WorkflowVerifierProof } from "./workflow-governance-types.js";

export async function governWorkflowUpdate(input: GovernWorkflowInput): Promise<WorkflowGovernanceResult> {
  await ensureConfig(input.projectRoot);
  const actor = { actorId: input.actorId };
  const workflow = await input.brain.read({ actor, artifactId: input.workflowArtifactId });
  if (workflow.type !== "workflow" || workflow.details.kind !== "workflow") {
    throw new ValidationError("Governed workflow update requires a Brain workflow artifact");
  }
  if (input.action === "patch" && input.baseSkillPath === undefined) {
    return await reject(input, workflow, "patch workflow update requires a base skill path", false);
  }
  if (input.action === "create" && input.baseSkillPath !== undefined) {
    return await reject(input, workflow, "create workflow update cannot include a base skill path", false);
  }
  if (boundedWorkflowSteps(workflow).length === 0) {
    return await reject(input, workflow, "workflow has no bounded executable steps", false);
  }
  if (input.proof === undefined) {
    return { status: "draft", reason: "reliable verifier proof is missing", workflow };
  }
  const proofError = verifierError(input.proof, workflow);
  if (proofError !== null) {
    return await reject(input, workflow, proofError, input.proof.status !== "passed");
  }
  const candidate = await captureImmutableCandidate(input, workflow);
  if (input.promote === undefined) {
    return { status: "candidate", workflow, candidate };
  }
  const validation = await validateSkillPackage(join(input.projectRoot, ".skillloom", "candidates", candidate.candidateId, "skill"), {
    expectedName: candidate.metadata.name,
    expectedHash: candidate.packageHash
  });
  const config = await ensureConfig(input.projectRoot);
  const policy = evaluateAutoPromotion(config, {
    candidateId: candidate.candidateId,
    packageHash: validation.packageHash,
    targets: [...input.promote.targets],
    scopes: input.promote.targets.map(() => input.promote?.scope ?? "project"),
    files: validation.files,
    warnings: validation.findings.filter((finding) => finding.severity === "warning").length,
    dangers: validation.findings.filter((finding) => finding.severity === "danger").length,
    capabilities: validation.metadata.capabilities ?? []
  });
  if (!policy.approved) {
    return await reject(input, workflow, `policy rejected workflow promotion: ${policy.reasons.join("; ")}`, true);
  }
  const promotion = await promoteCandidate(
    { projectRoot: input.projectRoot, homeDir: input.homeDir },
    candidate.candidateId,
    input.promote.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: input.promote?.scope ?? "project" })),
    { kind: "policy", workflowProof: candidate.governedWorkflowProof }
  );
  return { status: "promoted", workflow, candidate, promotion };
}

async function captureImmutableCandidate(input: GovernWorkflowInput, workflow: BrainArtifact): Promise<CandidateRecord> {
  const operationId = `op-workflow-${stableUuid(input.operationId)}`;
  return await withStoreLock(input.projectRoot, async () => {
    const packageRoot = await writeWorkflowSkillPackage(input.projectRoot, input.operationId, workflow, input.action, input.baseSkillPath);
    let snapshot: StagedCandidateSnapshot | undefined;
    try {
      snapshot = await stageCandidateSnapshot(input.projectRoot, operationId, packageRoot);
      const validation = await validateSkillPackage(snapshot.skillRoot, { folderNamePolicy: "match-metadata" });
      const createdAt = stableTimestamp(workflow.updatedAt, input.operationId);
      const candidateId = createCandidateId(createdAt, validation.packageHash);
      const existing = await readCandidate(input.projectRoot, candidateId).catch(() => null);
      if (existing !== null) {
        await discardCandidateSnapshot(snapshot);
        return existing;
      }
      const record: CandidateRecord = {
        candidateId,
        operationId,
        state: stateForFindings(validation.findings),
        metadata: validation.metadata,
        packageHash: validation.packageHash,
        createdAt,
        createdBy: "agent",
        evidence: [`workflow:${workflow.id}@${workflow.revision}`, `proof:${input.proof?.kind ?? "missing"}`],
        findings: validation.findings,
        base: await baseFor(input),
        governedWorkflowProof: proofDecision(input, workflow, candidateId, validation.packageHash)
      };
      await commitCandidateSnapshot(input.projectRoot, record, snapshot);
      snapshot = undefined;
      await appendEvent(input.projectRoot, { operationId, kind: "capture", phase: "snapshotted", evidence: { candidateId, workflowArtifactId: workflow.id } });
      return record;
    } finally {
      if (snapshot !== undefined) await discardCandidateSnapshot(snapshot).catch(() => undefined);
      await rm(packageRoot, { recursive: true, force: true });
      await rm(dirname(packageRoot), { recursive: true, force: true });
    }
  }, { operationId, context: "workflow-governance" });
}

async function reject(
  input: GovernWorkflowInput,
  workflow: BrainArtifact,
  reason: string,
  retryable: boolean
): Promise<Extract<WorkflowGovernanceResult, { status: "rejected" }>> {
  const actor = { actorId: input.actorId };
  const rejected = await input.brain.capture({
    actor,
    requestId: `workflow-governance:rejected:${stableUuid(`${input.operationId}:${workflow.id}:${workflow.revision}:${reason}`)}`,
    type: "rejected-update",
    title: `Rejected workflow update: ${workflow.title}`,
    content: workflow.content,
    provenance: {
      source: "skillloom-workflow-governance",
      workflowArtifactId: workflow.id,
      workflowRevision: workflow.revision,
      workflowContentHash: workflow.contentHash,
      operationId: input.operationId,
      reason
    },
    details: { kind: "rejected-update", targetArtifactId: workflow.id, rejectedAt: stableTimestamp(workflow.updatedAt, input.operationId), reason, retryable },
    sensitivity: workflow.sensitivity
  });
  await input.brain.capture({
    actor,
    requestId: `workflow-governance:feedback:${stableUuid(`${input.operationId}:${workflow.id}:${reason}`)}`,
    type: "feedback",
    title: `Workflow governance feedback: ${workflow.title}`,
    content: reason,
    provenance: {
      source: "skillloom-workflow-governance",
      workflowArtifactId: workflow.id,
      rejectedUpdateId: rejected.artifact.id
    },
    details: { kind: "feedback", targetArtifactId: workflow.id, signal: "negative", reason },
    sensitivity: workflow.sensitivity
  });
  await writeLearningEvent(input.projectRoot, {
    source: "codex",
    outcome: "memory",
    summary: `Rejected workflow update: ${reason}`,
    episode: {
      taskId: input.operationId,
      host: "codex",
      outcome: "failure",
      evidence: [{ category: "mcp", summary: `workflow:${workflow.id}` }],
      verifierSignals: [{ kind: "review", status: "failed", summary: reason }]
    }
  });
  return { status: "rejected", reason, workflow, rejectedUpdateId: rejected.artifact.id };
}

function verifierError(proof: WorkflowVerifierProof, workflow: BrainArtifact): string | null {
  if (proof.status !== "passed") return `verifier ${proof.kind} failed: ${proof.summary}`;
  if (proof.workflow.artifactId !== workflow.id || proof.workflow.revision !== workflow.revision || proof.workflow.contentHash !== workflow.contentHash) {
    return "verifier proof is not bound to the workflow artifact";
  }
  const hashes = provenanceHashes(workflow);
  if (hashes.length > 0 && !hashes.every((hash) => proof.provenanceHashes.includes(hash))) {
    return "verifier proof is not bound to workflow episode provenance";
  }
  if (proof.kind === "held-out-evaluation" && proof.score < proof.threshold) {
    return `held-out evaluation score ${proof.score} is below ${proof.threshold}`;
  }
  return null;
}

function provenanceHashes(workflow: BrainArtifact): string[] {
  const hashes = workflow.provenance.provenanceHashes;
  if (!Array.isArray(hashes)) return [];
  const values: string[] = [];
  for (const hash of hashes) {
    if (typeof hash === "string" && /^sha256:[0-9a-f]{64}$/u.test(hash)) values.push(hash);
  }
  return values;
}

async function baseFor(input: GovernWorkflowInput): Promise<CandidateBase> {
  if (input.action !== "patch" || input.baseSkillPath === undefined) return { kind: "none" };
  const validation = await validateSkillPackage(input.baseSkillPath);
  return { kind: "installed", path: input.baseSkillPath, hash: validation.packageHash };
}

function proofDecision(input: GovernWorkflowInput, workflow: BrainArtifact, candidateId: string, packageHash: string): WorkflowProofDecision | undefined {
  if (input.proof === undefined) return undefined;
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: `proof-${stableUuid(`${input.operationId}:${workflow.id}:${candidateId}`)}`,
    idempotencyKey: input.operationId,
    verdict: input.proof.status,
    workflow: {
      artifactId: workflow.id,
      revision: workflow.revision,
      contentHash: workflow.contentHash
    },
    candidate: { candidateId, packageHash },
    verifier: {
      kind: input.proof.kind,
      summary: input.proof.summary,
      evidence: input.proof.kind === "replay" ? input.proof.command : `${input.proof.score}/${input.proof.threshold}`
    },
    provenanceHashes: [...input.proof.provenanceHashes],
    decidedAt: new Date().toISOString()
  };
}

function stableTimestamp(updatedAt: string, operationId: string): string {
  const base = Number.isNaN(Date.parse(updatedAt)) ? new Date("2026-01-01T00:00:00.000Z") : new Date(updatedAt);
  const offset = Number.parseInt(createHash("sha256").update(operationId).digest("hex").slice(0, 8), 16) % 1000;
  return new Date(base.getTime() + offset).toISOString();
}

function stableUuid(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
