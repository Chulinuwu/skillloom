import { ValidationError } from "../domain/errors.js";

export type LearningOutcome = "no-op" | "memory" | "skill-create" | "skill-patch";
export type LearningSource = "claude" | "codex" | "agents" | "generic";
export type LearningTaskOutcome = "success" | "failure" | "cancelled" | "unknown";
export type LearningToolCategory = "filesystem" | "shell" | "network" | "browser" | "mcp" | "test" | "build" | "unknown";
export type ConsolidationJobStatus = "pending" | "processing" | "complete" | "failed";
export type ConsolidationProposalKind = "feedback" | "heuristic" | "workflow-draft" | "rejected-update";

export type LearningEvidence = {
  summary: string;
  category: LearningToolCategory;
  provenanceHash: string;
};

export type LearningVerifierSignal = {
  kind: "test" | "typecheck" | "lint" | "build" | "review" | "runtime";
  status: "passed" | "failed" | "unknown";
  summary: string;
  provenanceHash: string;
};

export type LearningEpisode = {
  taskId: string;
  host: LearningSource;
  outcome: LearningTaskOutcome;
  startedAt: string;
  endedAt: string;
  evidence: LearningEvidence[];
  verifierSignals: LearningVerifierSignal[];
  provenanceHashes: string[];
};

export type LearningEvent = {
  eventId: string;
  createdAt: string;
  source: LearningSource;
  outcome: LearningOutcome;
  summary: string;
  candidateId?: string;
  episode?: LearningEpisode;
};

export type ConsolidationJob = {
  jobId: string;
  eventId: string;
  episodeHash: string;
  status: ConsolidationJobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  cursor?: string;
  lastError?: string;
};

export type ConsolidationProposal = {
  proposalId: string;
  jobId: string;
  kind: ConsolidationProposalKind;
  title: string;
  content: string;
  reason: string;
  retryable: boolean;
  evidenceEventIds: string[];
  provenanceHashes: string[];
  createdAt: string;
};

export type ConsolidationRunResult = {
  processed: number;
  completed: number;
  failed: number;
  proposals: ConsolidationProposal[];
};

export function parseLearningEvent(value: unknown): LearningEvent {
  if (!isRecord(value)
    || typeof value.eventId !== "string" || !value.eventId.startsWith("learn-")
    || typeof value.createdAt !== "string" || invalidDate(value.createdAt)
    || !isSource(value.source)
    || !isOutcome(value.outcome)
    || typeof value.summary !== "string"
    || value.summary.length > 500
    || value.candidateId !== undefined && typeof value.candidateId !== "string"
    || value.episode !== undefined && !isEpisode(value.episode)) {
    throw new ValidationError("Invalid Skillloom learning event");
  }
  return {
    eventId: value.eventId,
    createdAt: value.createdAt,
    source: value.source,
    outcome: value.outcome,
    summary: value.summary,
    ...(value.candidateId ? { candidateId: value.candidateId } : {}),
    ...(value.episode === undefined ? {} : { episode: value.episode })
  };
}

export function parseConsolidationJob(value: unknown): ConsolidationJob {
  if (!isRecord(value)
    || typeof value.jobId !== "string" || !value.jobId.startsWith("consolidate-")
    || typeof value.eventId !== "string" || !value.eventId.startsWith("learn-")
    || !isSha256(value.episodeHash)
    || !isJobStatus(value.status)
    || typeof value.attempts !== "number" || !Number.isInteger(value.attempts) || value.attempts < 0
    || typeof value.createdAt !== "string" || invalidDate(value.createdAt)
    || typeof value.updatedAt !== "string" || invalidDate(value.updatedAt)
    || value.cursor !== undefined && typeof value.cursor !== "string"
    || value.lastError !== undefined && typeof value.lastError !== "string") {
    throw new ValidationError("Invalid Skillloom consolidation job");
  }
  return {
    jobId: value.jobId,
    eventId: value.eventId,
    episodeHash: value.episodeHash,
    status: value.status,
    attempts: value.attempts,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
    ...(value.lastError === undefined ? {} : { lastError: value.lastError })
  };
}

export function parseConsolidationProposal(value: unknown): ConsolidationProposal {
  if (!isRecord(value)
    || typeof value.proposalId !== "string" || !value.proposalId.startsWith("proposal-")
    || typeof value.jobId !== "string" || !value.jobId.startsWith("consolidate-")
    || !isProposalKind(value.kind)
    || typeof value.title !== "string" || value.title.length === 0 || value.title.length > 160
    || typeof value.content !== "string" || value.content.length === 0 || value.content.length > 2_000
    || typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 500
    || typeof value.retryable !== "boolean"
    || !isStringArray(value.evidenceEventIds)
    || !isStringArray(value.provenanceHashes) || !value.provenanceHashes.every(isSha256)
    || typeof value.createdAt !== "string" || invalidDate(value.createdAt)) {
    throw new ValidationError("Invalid Skillloom consolidation proposal");
  }
  return {
    proposalId: value.proposalId,
    jobId: value.jobId,
    kind: value.kind,
    title: value.title,
    content: value.content,
    reason: value.reason,
    retryable: value.retryable,
    evidenceEventIds: value.evidenceEventIds,
    provenanceHashes: value.provenanceHashes,
    createdAt: value.createdAt
  };
}

function isEpisode(value: unknown): value is LearningEpisode {
  if (!isRecord(value)
    || typeof value.taskId !== "string" || value.taskId.length === 0 || value.taskId.length > 120
    || !isSource(value.host)
    || !isTaskOutcome(value.outcome)
    || typeof value.startedAt !== "string" || invalidDate(value.startedAt)
    || typeof value.endedAt !== "string" || invalidDate(value.endedAt)
    || !Array.isArray(value.evidence) || value.evidence.length > 8 || !value.evidence.every(isEvidence)
    || !Array.isArray(value.verifierSignals) || value.verifierSignals.length > 8 || !value.verifierSignals.every(isVerifierSignal)
    || !isStringArray(value.provenanceHashes) || value.provenanceHashes.length > 16 || !value.provenanceHashes.every(isSha256)) {
    return false;
  }
  return Date.parse(value.startedAt) <= Date.parse(value.endedAt);
}

function isEvidence(value: unknown): value is LearningEvidence {
  return isRecord(value)
    && typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 240
    && isToolCategory(value.category)
    && isSha256(value.provenanceHash);
}

function isVerifierSignal(value: unknown): value is LearningVerifierSignal {
  return isRecord(value)
    && (value.kind === "test" || value.kind === "typecheck" || value.kind === "lint" || value.kind === "build" || value.kind === "review" || value.kind === "runtime")
    && (value.status === "passed" || value.status === "failed" || value.status === "unknown")
    && typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 240
    && isSha256(value.provenanceHash);
}

function isSource(value: unknown): value is LearningSource {
  return value === "claude" || value === "codex" || value === "agents" || value === "generic";
}

function isOutcome(value: unknown): value is LearningOutcome {
  return value === "no-op" || value === "memory" || value === "skill-create" || value === "skill-patch";
}

function isTaskOutcome(value: unknown): value is LearningTaskOutcome {
  return value === "success" || value === "failure" || value === "cancelled" || value === "unknown";
}

function isToolCategory(value: unknown): value is LearningToolCategory {
  return value === "filesystem" || value === "shell" || value === "network" || value === "browser" || value === "mcp" || value === "test" || value === "build" || value === "unknown";
}

function isJobStatus(value: unknown): value is ConsolidationJobStatus {
  return value === "pending" || value === "processing" || value === "complete" || value === "failed";
}

function isProposalKind(value: unknown): value is ConsolidationProposalKind {
  return value === "feedback" || value === "heuristic" || value === "workflow-draft" || value === "rejected-update";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function invalidDate(value: string): boolean {
  return Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
