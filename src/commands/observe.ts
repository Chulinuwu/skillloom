import type { Command } from "../domain/types.js";
import { ensureConfig } from "../config/service.js";
import { appendEvent } from "../store/journal.js";
import { writeLearningEvent } from "../store/learning.js";

export async function observeCommand(command: Extract<Command, { command: "observe" }>, projectRoot = process.cwd()) {
  await ensureConfig(projectRoot);
  const event = await writeLearningEvent(projectRoot, command);
  await appendEvent(projectRoot, {
    operationId: `op-${event.eventId}`,
    kind: "learn",
    phase: "completed",
    evidence: { eventId: event.eventId, source: event.source, outcome: event.outcome, candidateId: event.candidateId }
  });
  return event;
}
