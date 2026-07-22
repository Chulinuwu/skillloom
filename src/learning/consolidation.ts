import { createHash } from "node:crypto";
import {
  listConsolidationJobs,
  listConsolidationProposals,
  listLearningEvents,
  resetProcessingConsolidationJobs,
  writeConsolidationJob,
  writeConsolidationProposal
} from "../store/learning.js";
import { writeProposalToBrain, type BrainProposalWriter } from "./brain-handoff.js";
import type { ConsolidationJob, ConsolidationProposal, ConsolidationRunResult, LearningEpisode, LearningEvent } from "./types.js";

const recurrenceThreshold = 2;
const batchLimit = 10;

export async function runLearningConsolidation(root: string, writer?: BrainProposalWriter): Promise<ConsolidationRunResult> {
  await resetProcessingConsolidationJobs(root);
  const events = await listLearningEvents(root);
  const proposals = await listConsolidationProposals(root);
  const jobs = (await listConsolidationJobs(root))
    .filter((job) => job.status === "pending" || retryableFailure(job))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, batchLimit);
  const result: ConsolidationRunResult = { processed: 0, completed: 0, failed: 0, proposals: [] };
  for (const job of jobs) {
    result.processed += 1;
    const processing = await markJob(root, job, "processing");
    try {
      const proposal = await consolidateJob(processing, events, proposals, writer);
      if (proposal !== null) {
        await writeConsolidationProposal(root, proposal);
        result.proposals.push(proposal);
      }
      await markJob(root, processing, "complete");
      result.completed += 1;
    } catch (error) {
      const proposal = rejectedProposal(processing, [processing.eventId], [], message(error), true);
      await writeConsolidationProposal(root, proposal);
      await markJob(root, processing, "failed", message(error));
      result.proposals.push(proposal);
      result.failed += 1;
    }
  }
  return result;
}

async function consolidateJob(
  job: ConsolidationJob,
  events: readonly LearningEvent[],
  existing: readonly ConsolidationProposal[],
  writer: BrainProposalWriter | undefined
): Promise<ConsolidationProposal | null> {
  const event = events.find((item) => item.eventId === job.eventId);
  if (event?.episode === undefined) return rejectedProposal(job, [job.eventId], [], "episode is missing", false);
  const related = recurringEpisodes(event.episode, events);
  if (related.length < recurrenceThreshold) return rejectedProposal(job, [event.eventId], event.episode.provenanceHashes, "recurrence threshold not met", true);
  const proposal = proposalFromEpisode(job, event, related, existing);
  if (proposal === null) return null;
  if (writer !== undefined) await writeProposalToBrain(event, proposal, writer);
  return proposal;
}

function proposalFromEpisode(
  job: ConsolidationJob,
  event: LearningEvent,
  related: readonly LearningEvent[],
  existing: readonly ConsolidationProposal[]
): ConsolidationProposal | null {
  const hashes = [...new Set(related.flatMap((item) => item.episode?.provenanceHashes ?? []))].slice(0, 16);
  const evidenceEventIds = related.map((item) => item.eventId);
  const firstCategory = event.episode?.evidence[0]?.category ?? "unknown";
  const failed = related.some((item) => item.episode?.outcome === "failure");
  const next = failed
    ? proposal(job, "feedback", `Recurring failure: ${firstCategory}`, `Record feedback for repeated ${firstCategory} failure. Keep future updates bounded and verifier-backed.`, "recurring failed episodes crossed threshold", false, evidenceEventIds, hashes)
    : event.outcome === "skill-create" || event.outcome === "skill-patch"
      ? proposal(job, "workflow-draft", `Workflow draft: ${firstCategory}`, `Draft a non-executable workflow from recurring ${firstCategory} successes. Promotion remains blocked until G005 validation and policy gates.`, "recurring successful procedural episodes crossed threshold", false, evidenceEventIds, hashes)
      : proposal(job, "heuristic", `Heuristic: ${firstCategory}`, `Prefer the recurring verified ${firstCategory} approach when similar evidence appears. Keep this as non-executable guidance.`, "recurring successful declarative episodes crossed threshold", false, evidenceEventIds, hashes);
  return repeatedRejected(existing, next) ? null : next;
}

function recurringEpisodes(episode: LearningEpisode, events: readonly LearningEvent[]): LearningEvent[] {
  const signature = episodeSignature(episode);
  return events.filter((event) => event.episode !== undefined && episodeSignature(event.episode) === signature);
}

function episodeSignature(episode: LearningEpisode): string {
  const category = episode.evidence[0]?.category ?? "unknown";
  const verifier = episode.verifierSignals[0]?.kind ?? "runtime";
  return `${episode.host}:${episode.outcome}:${category}:${verifier}`;
}

function rejectedProposal(job: ConsolidationJob, evidenceEventIds: readonly string[], hashes: readonly string[], reason: string, retryable: boolean): ConsolidationProposal {
  return proposal(job, "rejected-update", "Rejected consolidation update", "The proposed consolidation was rejected and should not be repeated blindly.", reason, retryable, evidenceEventIds, hashes);
}

function proposal(
  job: ConsolidationJob,
  kind: ConsolidationProposal["kind"],
  title: string,
  content: string,
  reason: string,
  retryable: boolean,
  evidenceEventIds: readonly string[],
  provenanceHashes: readonly string[]
): ConsolidationProposal {
  const createdAt = new Date().toISOString();
  return {
    proposalId: `proposal-${stableUuid(`${job.jobId}:${kind}:${reason}:${evidenceEventIds.join(",")}`)}`,
    jobId: job.jobId,
    kind,
    title,
    content,
    reason,
    retryable,
    evidenceEventIds: [...evidenceEventIds],
    provenanceHashes: [...provenanceHashes],
    createdAt
  };
}

function repeatedRejected(existing: readonly ConsolidationProposal[], proposal: ConsolidationProposal): boolean {
  return proposal.kind === "rejected-update" && existing.some((item) => item.kind === "rejected-update"
    && item.reason === proposal.reason && item.evidenceEventIds.join(",") === proposal.evidenceEventIds.join(","));
}

async function markJob(root: string, job: ConsolidationJob, status: ConsolidationJob["status"], lastError?: string): Promise<ConsolidationJob> {
  const next: ConsolidationJob = {
    ...job,
    status,
    attempts: status === "processing" ? job.attempts + 1 : job.attempts,
    updatedAt: new Date().toISOString(),
    ...(lastError === undefined ? {} : { lastError: lastError.slice(0, 500) })
  };
  await writeConsolidationJob(root, next);
  return next;
}

function retryableFailure(job: ConsolidationJob): boolean {
  return job.status === "failed" && job.attempts < 3;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stableUuid(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
