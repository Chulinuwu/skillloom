import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseLearningEvent, type LearningEvent, type LearningOutcome, type LearningSource } from "../learning/types.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { storeLayout } from "./layout.js";

export async function writeLearningEvent(
  root: string,
  input: { source: LearningSource; outcome: LearningOutcome; summary: string; candidateId?: string }
): Promise<LearningEvent> {
  const event: LearningEvent = {
    eventId: `learn-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    source: input.source,
    outcome: input.outcome,
    summary: cleanSummary(input.summary),
    ...(input.candidateId ? { candidateId: input.candidateId } : {})
  };
  const layout = storeLayout(root);
  await mkdir(layout.learningEvents, { recursive: true });
  await atomicWriteJson(join(layout.learningEvents, `${event.eventId}.json`), event);
  return event;
}

export async function listLearningEvents(root: string): Promise<LearningEvent[]> {
  const path = storeLayout(root).learningEvents;
  try {
    const entries = (await readdir(path)).filter((entry) => entry.endsWith(".json")).sort();
    const events = await Promise.all(entries.map(async (entry) => parseLearningEvent(JSON.parse(await readFile(join(path, entry), "utf8")))));
    return events.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function cleanSummary(summary: string): string {
  const value = summary.trim().replace(/\s+/gu, " ").slice(0, 500);
  return /(transcript|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-)/iu.test(value) ? "[REDACTED]" : value;
}
