import { ensureConfig } from "../config/service.js";
import type { Command } from "../domain/types.js";
import type { LearningEpisodeInput } from "../learning/episode.js";
import type { LearningVerifierSignal } from "../learning/types.js";
import { appendEvent } from "../store/journal.js";
import { writeLearningEvent } from "../store/learning.js";

type ObserveCommand = Extract<Command, { command: "observe" }>;

export async function observeCommand(command: ObserveCommand, projectRoot = process.cwd()) {
  await ensureConfig(projectRoot);
  const event = await writeLearningEvent(projectRoot, {
    ...command,
    ...(hasEpisode(command) ? { episode: episodeInput(command) } : {})
  });
  await appendEvent(projectRoot, {
    operationId: `op-${event.eventId}`,
    kind: "learn",
    phase: "completed",
    evidence: { eventId: event.eventId, source: event.source, outcome: event.outcome, candidateId: event.candidateId }
  });
  return event;
}

function hasEpisode(command: ObserveCommand): boolean {
  return command.taskId !== undefined || command.taskOutcome !== undefined || (command.evidence?.length ?? 0) > 0 || (command.verifier?.length ?? 0) > 0;
}

function episodeInput(command: ObserveCommand): LearningEpisodeInput {
  return {
    ...(command.taskId === undefined ? {} : { taskId: command.taskId }),
    host: command.source,
    ...(command.taskOutcome === undefined ? {} : { outcome: command.taskOutcome }),
    evidence: (command.evidence ?? []).map(parseEvidence),
    verifierSignals: (command.verifier ?? []).map(parseVerifier)
  };
}

function parseEvidence(value: string): { category: NonNullable<LearningEpisodeInput["evidence"]>[number]["category"]; summary: string } {
  const [category, ...rest] = value.split(":");
  return { category: evidenceCategory(category), summary: rest.join(":") || value };
}

function parseVerifier(value: string): { kind: LearningVerifierSignal["kind"]; status: LearningVerifierSignal["status"]; summary: string } {
  const [kind, status, ...rest] = value.split(":");
  return { kind: verifierKind(kind), status: verifierStatus(status), summary: rest.join(":") || value };
}

function evidenceCategory(value: string | undefined): NonNullable<LearningEpisodeInput["evidence"]>[number]["category"] {
  return value === "filesystem" || value === "shell" || value === "network" || value === "browser" || value === "mcp" || value === "test" || value === "build" ? value : "unknown";
}

function verifierKind(value: string | undefined): LearningVerifierSignal["kind"] {
  return value === "test" || value === "typecheck" || value === "lint" || value === "build" || value === "review" ? value : "runtime";
}

function verifierStatus(value: string | undefined): LearningVerifierSignal["status"] {
  return value === "passed" || value === "failed" ? value : "unknown";
}
