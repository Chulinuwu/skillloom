import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "../files/atomic-write.js";
import { episodeHandoffId, episodeToBrainHandoff, proposalToBrainHandoff, type BrainLearningHandoff } from "../learning/brain-handoff.js";
import { buildLearningEpisode, cleanLearningSummary, hashEpisodeIdentity, type LearningEpisodeInput } from "../learning/episode.js";
import {
  parseConsolidationJob,
  parseConsolidationProposal,
  parseLearningEvent,
  type ConsolidationJob,
  type ConsolidationProposal,
  type LearningEvent,
  type LearningOutcome,
  type LearningSource
} from "../learning/types.js";
import { storeLayout } from "./layout.js";

export async function writeLearningEvent(
  root: string,
  input: { source: LearningSource; outcome: LearningOutcome; summary: string; candidateId?: string; episode?: LearningEpisodeInput }
): Promise<LearningEvent> {
  const now = new Date().toISOString();
  const episode = input.episode === undefined ? undefined : buildLearningEpisode(input.episode);
  const event: LearningEvent = {
    eventId: `learn-${randomUUID()}`,
    createdAt: now,
    source: input.source,
    outcome: input.outcome,
    summary: cleanLearningSummary(input.summary),
    ...(input.candidateId ? { candidateId: input.candidateId } : {}),
    ...(episode === undefined ? {} : { episode })
  };
  const layout = storeLayout(root);
  await mkdir(layout.learningEvents, { recursive: true });
  await atomicWriteJson(join(layout.learningEvents, `${event.eventId}.json`), event);
  if (event.episode !== undefined) {
    const episodeHash = hashEpisodeIdentity(event.episode);
    const handoff = episodeToBrainHandoff(event, episodeHash);
    if (handoff !== null) await writeBrainLearningHandoff(root, handoff);
    await enqueueConsolidationJob(root, event, episodeHash);
  }
  return event;
}

export async function listLearningEvents(root: string): Promise<LearningEvent[]> {
  return await readJsonDirectory(storeLayout(root).learningEvents, parseLearningEvent, "createdAt");
}

export async function enqueueConsolidationJob(root: string, event: LearningEvent, existingEpisodeHash?: string): Promise<ConsolidationJob | null> {
  if (event.episode === undefined) return null;
  const layout = storeLayout(root);
  await mkdir(layout.learningConsolidationJobs, { recursive: true });
  const episodeHash = existingEpisodeHash ?? hashEpisodeIdentity(event.episode);
  const existing = await findConsolidationJobByEpisodeHash(root, episodeHash);
  if (existing) return existing;
  const now = new Date().toISOString();
  const job: ConsolidationJob = {
    jobId: `consolidate-${randomUUID()}`,
    eventId: event.eventId,
    episodeHash,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
  await atomicWriteJson(consolidationJobPath(root, job.jobId), job, { mode: 0o600 });
  return job;
}

export async function listConsolidationJobs(root: string): Promise<ConsolidationJob[]> {
  return await readJsonDirectory(storeLayout(root).learningConsolidationJobs, parseConsolidationJob, "createdAt");
}

export async function writeConsolidationJob(root: string, job: ConsolidationJob): Promise<void> {
  await mkdir(storeLayout(root).learningConsolidationJobs, { recursive: true });
  await atomicWriteJson(consolidationJobPath(root, job.jobId), parseConsolidationJob(job), { mode: 0o600 });
}

export async function writeConsolidationProposal(root: string, proposal: ConsolidationProposal): Promise<void> {
  await mkdir(storeLayout(root).learningConsolidationProposals, { recursive: true });
  await atomicWriteJson(join(storeLayout(root).learningConsolidationProposals, `${proposal.proposalId}.json`), parseConsolidationProposal(proposal), { mode: 0o600 });
  await writeBrainLearningHandoff(root, proposalToBrainHandoff(proposal, await proposalEpisodeHandoffId(root, proposal)));
}

export async function listConsolidationProposals(root: string): Promise<ConsolidationProposal[]> {
  return await readJsonDirectory(storeLayout(root).learningConsolidationProposals, parseConsolidationProposal, "createdAt");
}

export async function writeBrainLearningHandoff(root: string, handoff: BrainLearningHandoff): Promise<void> {
  await mkdir(storeLayout(root).learningBrainHandoffs, { recursive: true });
  const existing = await readBrainLearningHandoff(root, handoff.handoffId);
  if (existing?.status === "drained") return;
  await atomicWriteJson(brainLearningHandoffPath(root, handoff.handoffId), handoff, { mode: 0o600 });
}

export async function listBrainLearningHandoffs(root: string): Promise<BrainLearningHandoff[]> {
  return await readJsonDirectory(storeLayout(root).learningBrainHandoffs, parseBrainLearningHandoff, "createdAt");
}

export async function resetProcessingConsolidationJobs(root: string): Promise<void> {
  const jobs = await listConsolidationJobs(root);
  await Promise.all(jobs.filter((job) => job.status === "processing").map(async (job) => {
    await writeConsolidationJob(root, {
      ...job,
      status: "pending",
      cursor: "recovered-processing",
      updatedAt: new Date().toISOString()
    });
  }));
}

export async function clearLearningStore(root: string): Promise<void> {
  await rm(storeLayout(root).learning, { recursive: true, force: true });
}

async function findConsolidationJobByEpisodeHash(root: string, episodeHash: string): Promise<ConsolidationJob | null> {
  return (await listConsolidationJobs(root)).find((job) => job.episodeHash === episodeHash) ?? null;
}

async function proposalEpisodeHandoffId(root: string, proposal: ConsolidationProposal): Promise<string> {
  const job = (await listConsolidationJobs(root)).find((item) => item.jobId === proposal.jobId);
  return episodeHandoffId(job?.episodeHash ?? proposal.evidenceEventIds[0] ?? proposal.jobId);
}

function consolidationJobPath(root: string, jobId: string): string {
  return join(storeLayout(root).learningConsolidationJobs, `${jobId}.json`);
}

function brainLearningHandoffPath(root: string, handoffId: string): string {
  return join(storeLayout(root).learningBrainHandoffs, `${handoffId}.json`);
}

async function readBrainLearningHandoff(root: string, handoffId: string): Promise<BrainLearningHandoff | null> {
  try {
    return parseBrainLearningHandoff(JSON.parse(await readFile(brainLearningHandoffPath(root, handoffId), "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function parseBrainLearningHandoff(value: unknown): BrainLearningHandoff {
  if (!isBrainLearningHandoff(value)) {
    throw new Error("Invalid Skillloom Brain handoff");
  }
  return value;
}

function isBrainLearningHandoff(value: unknown): value is BrainLearningHandoff {
  if (!isRecord(value)
    || typeof value.handoffId !== "string"
    || (value.status !== "pending" && value.status !== "drained" && value.status !== "failed")
    || typeof value.attempts !== "number"
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string") {
    return false;
  }
  if (value.kind === "episode") {
    return typeof value.eventId === "string" && isCaptureInput(value.capture);
  }
  return value.kind === "proposal"
    && typeof value.proposalId === "string"
    && typeof value.episodeHandoffId === "string"
    && isRecord(value.proposal);
}

function isCaptureInput(value: unknown): boolean {
  return isRecord(value)
    && isRecord(value.actor)
    && typeof value.actor.actorId === "string"
    && typeof value.requestId === "string"
    && typeof value.type === "string"
    && typeof value.title === "string"
    && typeof value.content === "string"
    && isRecord(value.provenance)
    && typeof value.sensitivity === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonDirectory<T>(path: string, parse: (value: unknown) => T, sortKey: keyof T): Promise<T[]> {
  try {
    const entries = (await readdir(path)).filter((entry) => entry.endsWith(".json")).sort();
    const records = await Promise.all(entries.map(async (entry) => parse(JSON.parse(await readFile(join(path, entry), "utf8")))));
    return records.sort((left, right) => String(left[sortKey]).localeCompare(String(right[sortKey])));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
