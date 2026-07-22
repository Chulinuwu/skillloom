import { createHash } from "node:crypto";
import type { BrainArtifactMetadata, CaptureBrainInput } from "../hub/brain/types.js";
import type { ConsolidationProposal, LearningEvent } from "./types.js";

export type BrainHandoffStatus = "pending" | "drained" | "failed";

type BrainHandoffBase = {
  handoffId: string;
  status: BrainHandoffStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  artifactId?: string;
  lastError?: string;
};

export type BrainEpisodeHandoff = BrainHandoffBase & {
  kind: "episode";
  eventId: string;
  capture: CaptureBrainInput;
};

export type BrainProposalHandoff = BrainHandoffBase & {
  kind: "proposal";
  proposalId: string;
  episodeHandoffId: string;
  proposal: ConsolidationProposal;
};

export type BrainLearningHandoff = BrainEpisodeHandoff | BrainProposalHandoff;

export type BrainProposalWriter = Readonly<{
  capture(input: CaptureBrainInput): Promise<{ artifact: Pick<BrainArtifactMetadata, "id"> }>;
}>;

export async function writeProposalToBrain(
  event: LearningEvent,
  proposal: ConsolidationProposal,
  writer: BrainProposalWriter
): Promise<void> {
  const episodeResult = await writer.capture(episodeToBrainCaptureInput(event));
  await writer.capture(proposalToBrainCaptureInput(proposal, episodeResult.artifact.id));
}

export function episodeToBrainCaptureInput(event: LearningEvent): CaptureBrainInput {
  const episode = event.episode;
  if (episode === undefined) throw new Error("Learning event has no bounded episode");
  return {
    actor: { actorId: "skillloom-learning" },
    requestId: requestIdFor(`episode:${event.eventId}`),
    type: "bounded-episode",
    title: `Bounded episode: ${episode.taskId}`,
    content: event.summary,
    frontmatter: {
      eventId: event.eventId,
      toolCategories: episode.evidence.map((item) => item.category),
      verifierSignals: episode.verifierSignals.map((item) => `${item.kind}:${item.status}`)
    },
    provenance: {
      source: "skillloom-learning-episode",
      eventId: event.eventId,
      provenanceHashes: episode.provenanceHashes
    },
    details: {
      kind: "episode",
      taskId: episode.taskId,
      hostId: episode.host,
      startedAt: episode.startedAt,
      endedAt: episode.endedAt,
      outcome: episode.outcome === "unknown" ? "partial" : episode.outcome
    },
    sensitivity: "tailnet"
  };
}

export function proposalToBrainCaptureInput(proposal: ConsolidationProposal, targetArtifactId: string): CaptureBrainInput {
  const base: Pick<CaptureBrainInput, "actor" | "requestId" | "title" | "content" | "provenance" | "sensitivity"> = {
    actor: { actorId: "skillloom-learning" },
    requestId: requestIdFor(proposal.proposalId),
    title: proposal.title,
    content: proposal.content,
    provenance: {
      source: "skillloom-learning-consolidation",
      proposalId: proposal.proposalId,
      jobId: proposal.jobId,
      targetEpisodeArtifactId: targetArtifactId,
      evidenceEventIds: proposal.evidenceEventIds,
      provenanceHashes: proposal.provenanceHashes,
      reason: proposal.reason
    },
    sensitivity: "tailnet"
  };
  if (proposal.kind === "feedback") {
    return {
      ...base,
      type: "feedback",
      layer: "agent-knowledge",
      details: { kind: "feedback", targetArtifactId, signal: "negative", reason: proposal.reason }
    };
  }
  if (proposal.kind === "workflow-draft") {
    return {
      ...base,
      type: "workflow",
      layer: "workflow",
      details: { kind: "workflow", trigger: proposal.title, steps: [proposal.content], verifier: "held until G005 replay or held-out evaluation", promotable: false }
    };
  }
  if (proposal.kind === "rejected-update") {
    return {
      ...base,
      type: "rejected-update",
      layer: "agent-knowledge",
      details: { kind: "rejected-update", targetArtifactId, rejectedAt: proposal.createdAt, reason: proposal.reason, retryable: proposal.retryable }
    };
  }
  return {
    ...base,
    type: "fact",
    layer: "agent-knowledge",
    details: { kind: "knowledge", status: "draft", confidence: 0.6 }
  };
}

export function episodeToBrainHandoff(event: LearningEvent, episodeHash: string): BrainEpisodeHandoff | null {
  if (event.episode === undefined) return null;
  const now = new Date().toISOString();
  return {
    kind: "episode",
    handoffId: episodeHandoffId(episodeHash),
    eventId: event.eventId,
    status: "pending",
    attempts: 0,
    capture: { ...episodeToBrainCaptureInput(event), requestId: requestIdFor(`episode:${episodeHash}`) },
    createdAt: now,
    updatedAt: now
  };
}

export function proposalToBrainHandoff(proposal: ConsolidationProposal, episodeHandoffId: string): BrainProposalHandoff {
  const now = new Date().toISOString();
  return {
    kind: "proposal",
    handoffId: proposal.proposalId,
    proposalId: proposal.proposalId,
    episodeHandoffId,
    proposal,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function episodeHandoffId(eventId: string): string {
  return `episode-${requestIdFor(eventId)}`;
}

function requestIdFor(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) return value;
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
