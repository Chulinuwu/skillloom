import { listBrainLearningHandoffs, writeBrainLearningHandoff } from "../store/learning.js";
import { proposalToBrainCaptureInput, type BrainLearningHandoff, type BrainProposalWriter } from "./brain-handoff.js";

export type BrainHandoffDrainResult = {
  drained: number;
  failed: number;
  skipped: number;
};

export async function drainBrainLearningHandoffs(root: string, writer: BrainProposalWriter): Promise<BrainHandoffDrainResult> {
  const handoffs = await listBrainLearningHandoffs(root);
  const result = { drained: 0, failed: 0, skipped: 0 };
  const drainedEpisodes = new Map(handoffs
    .filter((handoff) => handoff.kind === "episode" && handoff.status === "drained" && handoff.artifactId !== undefined)
    .map((handoff) => [handoff.handoffId, handoff.artifactId]));
  for (const handoff of handoffs.filter((item) => item.status === "pending" || retryable(item))) {
    try {
      if (handoff.kind === "episode") {
        const drained = await drainEpisode(root, writer, handoff);
        drainedEpisodes.set(drained.handoffId, drained.artifactId ?? "");
        result.drained += 1;
      } else {
        const targetArtifactId = drainedEpisodes.get(handoff.episodeHandoffId);
        if (targetArtifactId === undefined || targetArtifactId.length === 0) {
          result.skipped += 1;
        } else {
          await drainProposal(root, writer, handoff, targetArtifactId);
          result.drained += 1;
        }
      }
    } catch (error) {
      await writeBrainLearningHandoff(root, failed(handoff, error));
      result.failed += 1;
    }
  }
  return result;
}

async function drainEpisode(root: string, writer: BrainProposalWriter, handoff: Extract<BrainLearningHandoff, { kind: "episode" }>) {
  const output = await writer.capture(handoff.capture);
  const drained = checkpoint(handoff, "drained", output.artifact.id);
  await writeBrainLearningHandoff(root, drained);
  return drained;
}

async function drainProposal(
  root: string,
  writer: BrainProposalWriter,
  handoff: Extract<BrainLearningHandoff, { kind: "proposal" }>,
  targetArtifactId: string
) {
  const output = await writer.capture(proposalToBrainCaptureInput(handoff.proposal, targetArtifactId));
  await writeBrainLearningHandoff(root, checkpoint(handoff, "drained", output.artifact.id));
}

function checkpoint<T extends BrainLearningHandoff>(handoff: T, status: "drained", artifactId: string): T {
  return {
    ...handoff,
    status,
    attempts: handoff.attempts + 1,
    artifactId,
    updatedAt: new Date().toISOString()
  };
}

function failed<T extends BrainLearningHandoff>(handoff: T, error: unknown): T {
  return {
    ...handoff,
    status: "failed",
    attempts: handoff.attempts + 1,
    updatedAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
  };
}

function retryable(handoff: BrainLearningHandoff): boolean {
  return handoff.status === "failed" && handoff.attempts < 3;
}
