export type LearningOutcome = "no-op" | "memory" | "skill-create" | "skill-patch";

export type LearningSource = "claude" | "codex" | "agents";

export type LearningEvent = {
  eventId: string;
  createdAt: string;
  source: LearningSource;
  outcome: LearningOutcome;
  summary: string;
  candidateId?: string;
};

export function parseLearningEvent(value: unknown): LearningEvent {
  if (!isRecord(value)
    || typeof value.eventId !== "string" || !value.eventId.startsWith("learn-")
    || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))
    || !isSource(value.source)
    || !isOutcome(value.outcome)
    || typeof value.summary !== "string"
    || value.summary.length > 500
    || value.candidateId !== undefined && typeof value.candidateId !== "string") {
    throw new ValidationError("Invalid Skillloom learning event");
  }
  return {
    eventId: value.eventId,
    createdAt: value.createdAt,
    source: value.source,
    outcome: value.outcome,
    summary: value.summary,
    ...(value.candidateId ? { candidateId: value.candidateId } : {})
  };
}

function isSource(value: unknown): value is LearningSource {
  return value === "claude" || value === "codex" || value === "agents";
}

function isOutcome(value: unknown): value is LearningOutcome {
  return value === "no-op" || value === "memory" || value === "skill-create" || value === "skill-patch";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { ValidationError } from "../domain/errors.js";
