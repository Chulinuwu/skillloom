import { createHash } from "node:crypto";
import type { LearningEpisode, LearningEvidence, LearningSource, LearningTaskOutcome, LearningToolCategory, LearningVerifierSignal } from "./types.js";
import { redactLearningText } from "./redaction.js";

export type LearningEpisodeInput = Readonly<{
  taskId?: string;
  host: LearningSource;
  outcome?: LearningTaskOutcome;
  startedAt?: string;
  endedAt?: string;
  evidence?: readonly { summary: string; category?: LearningToolCategory; provenance?: string }[];
  verifierSignals?: readonly { kind: LearningVerifierSignal["kind"]; status: LearningVerifierSignal["status"]; summary: string; provenance?: string }[];
}>;

export function buildLearningEpisode(input: LearningEpisodeInput, now = new Date()): LearningEpisode {
  const endedAt = normalizeTimestamp(input.endedAt, now.toISOString());
  const startedAt = normalizeTimestamp(input.startedAt, endedAt);
  const evidence = bounded(input.evidence ?? [], 8).map((item) => evidenceItem(item.summary, item.category ?? "unknown", item.provenance));
  const verifierSignals = bounded(input.verifierSignals ?? [], 8).map((item) => verifierSignal(item.kind, item.status, item.summary, item.provenance));
  const provenanceHashes = [...new Set([...evidence.map((item) => item.provenanceHash), ...verifierSignals.map((item) => item.provenanceHash)])].slice(0, 16);
  return {
    taskId: clean(input.taskId ?? `task-${hashText(`${input.host}:${startedAt}:${endedAt}`).slice(7, 19)}`, 120),
    host: input.host,
    outcome: input.outcome ?? "unknown",
    startedAt,
    endedAt,
    evidence,
    verifierSignals,
    provenanceHashes
  };
}

export function hashEpisode(episode: LearningEpisode): string {
  return hashText(JSON.stringify(episode));
}

export function hashEpisodeIdentity(episode: LearningEpisode): string {
  return hashText(JSON.stringify({
    taskId: episode.taskId,
    host: episode.host,
    outcome: episode.outcome,
    evidence: episode.evidence,
    verifierSignals: episode.verifierSignals,
    provenanceHashes: episode.provenanceHashes
  }));
}

export function cleanLearningSummary(summary: string): string {
  return redactLearningText(summary, 500);
}

function evidenceItem(summary: string, category: LearningToolCategory, provenance: string | undefined): LearningEvidence {
  const cleaned = clean(summary, 240);
  return {
    summary: redactLearningText(cleaned, 240),
    category,
    provenanceHash: provenanceHash(provenance ?? `${category}:${cleaned}`)
  };
}

function verifierSignal(kind: LearningVerifierSignal["kind"], status: LearningVerifierSignal["status"], summary: string, provenance: string | undefined): LearningVerifierSignal {
  const cleaned = clean(summary, 240);
  return {
    kind,
    status,
    summary: redactLearningText(cleaned, 240),
    provenanceHash: provenanceHash(provenance ?? `${kind}:${status}:${cleaned}`)
  };
}

function clean(value: string, limit: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, limit) || "[REDACTED]";
}

function normalizeTimestamp(value: string | undefined, fallback: string): string {
  if (value === undefined || Number.isNaN(Date.parse(value))) return new Date(fallback).toISOString();
  return new Date(value).toISOString();
}

function provenanceHash(value: string): string {
  return value.startsWith("sha256:") && /^sha256:[0-9a-f]{64}$/u.test(value) ? value : hashText(value);
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function bounded<T>(items: readonly T[], limit: number): T[] {
  return items.slice(0, limit);
}
