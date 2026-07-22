import type { WorkflowProofDecision } from "./workflow-proof.js";

export type WorkflowProofErrorFactory = (message: string) => Error;

export function parseWorkflowProofDecision(
  value: unknown,
  invalid: WorkflowProofErrorFactory,
  field = "workflowProof"
): WorkflowProofDecision {
  const record = strictRecord(value, [
    "schemaVersion",
    "decisionId",
    "idempotencyKey",
    "verdict",
    "workflow",
    "candidate",
    "verifier",
    "provenanceHashes",
    "decidedAt"
  ], field, invalid);
  literal(record.schemaVersion, "skillloom-workflow-proof-v1", `${field}.schemaVersion`, invalid);
  if (record.verdict !== "passed" && record.verdict !== "failed") throw invalid(`${field}.verdict is invalid`);
  const workflow = strictRecord(record.workflow, ["artifactId", "revision", "contentHash"], `${field}.workflow`, invalid);
  const candidate = strictRecord(record.candidate, ["candidateId", "packageHash"], `${field}.candidate`, invalid);
  const verifier = strictRecord(record.verifier, ["kind", "summary", "evidence"], `${field}.verifier`, invalid);
  if (verifier.kind !== "replay" && verifier.kind !== "held-out-evaluation") throw invalid(`${field}.verifier.kind is invalid`);
  if (!Array.isArray(record.provenanceHashes)) throw invalid(`${field}.provenanceHashes must be an array`);
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: text(record.decisionId, `${field}.decisionId`, invalid),
    idempotencyKey: text(record.idempotencyKey, `${field}.idempotencyKey`, invalid),
    verdict: record.verdict,
    workflow: {
      artifactId: text(workflow.artifactId, `${field}.workflow.artifactId`, invalid),
      revision: sequence(workflow.revision, `${field}.workflow.revision`, invalid),
      contentHash: digest(workflow.contentHash, `${field}.workflow.contentHash`, invalid)
    },
    candidate: {
      candidateId: text(candidate.candidateId, `${field}.candidate.candidateId`, invalid),
      packageHash: packageHash(candidate.packageHash, `${field}.candidate.packageHash`, invalid)
    },
    verifier: {
      kind: verifier.kind,
      summary: text(verifier.summary, `${field}.verifier.summary`, invalid),
      evidence: text(verifier.evidence, `${field}.verifier.evidence`, invalid)
    },
    provenanceHashes: record.provenanceHashes.map((item, index) => digest(item, `${field}.provenanceHashes[${index}]`, invalid)),
    decidedAt: timestamp(record.decidedAt, `${field}.decidedAt`, invalid)
  };
}

function strictRecord(value: unknown, keys: readonly string[], field: string, invalid: WorkflowProofErrorFactory): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid(`${field} must be an object`);
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) throw invalid(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys as string[]) {
    if (!expected.has(key)) throw invalid(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw invalid(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw invalid(`${field}.${key} is required`);
  }
  return value as Record<string, unknown>;
}

function literal(value: unknown, expected: string, field: string, invalid: WorkflowProofErrorFactory): void {
  if (value !== expected) throw invalid(`${field} must equal ${expected}`);
}

function text(value: unknown, field: string, invalid: WorkflowProofErrorFactory): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw invalid(`${field} must be canonical non-empty text`);
  }
  return value;
}

function sequence(value: unknown, field: string, invalid: WorkflowProofErrorFactory): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid(`${field} must be a canonical nonnegative decimal sequence`);
  }
  return value;
}

function digest(value: unknown, field: string, invalid: WorkflowProofErrorFactory): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw invalid(`${field} must be a SHA-256 digest`);
  return value;
}

function packageHash(value: unknown, field: string, invalid: WorkflowProofErrorFactory): string {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) {
    throw invalid(`${field} must be a sha256-v2 package hash`);
  }
  return value;
}

function timestamp(value: unknown, field: string, invalid: WorkflowProofErrorFactory): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw invalid(`${field} must be a canonical ISO timestamp`);
  }
  return value;
}
