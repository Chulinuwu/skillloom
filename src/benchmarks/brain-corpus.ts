import type { createEvaluationBrainRuntime } from "../evaluation/brain-runtime.js";
import type { BrainArtifactMetadata } from "../hub/brain/index.js";
import type { BrainBenchmarkCase } from "./types.js";

export const benchmarkActorId = "user:benchmark@skillloom.local";

type EvaluationRuntime = Awaited<ReturnType<typeof createEvaluationBrainRuntime>>;
type BrainBenchmarkQuery = Readonly<{
  name: BrainBenchmarkCase["name"];
  query: string;
  targetId: string;
  required: boolean;
}>;

export async function populateBrainBenchmarkCorpus(
  runtime: EvaluationRuntime,
  records: number
): Promise<{ english: BrainArtifactMetadata; thai: BrainArtifactMetadata }> {
  const actor = runtime.actor(benchmarkActorId);
  const english = await runtime.brain.capture({
    actor,
    requestId: "benchmark-english-target",
    type: "note",
    title: "Stale Docker layer cache",
    content: "A stale Docker layer cache blocks rebuild verification until the affected image is rebuilt.",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  const thai = await runtime.brain.capture({
    actor,
    requestId: "benchmark-thai-target",
    type: "note",
    title: "แคช Docker ค้าง",
    content: "แคช Docker ค้าง ทำให้ผล build เก่ายังถูกใช้งานและต้องตรวจใหม่หลัง rebuild",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  await runtime.brain.capture({
    actor,
    requestId: "benchmark-distractor",
    type: "note",
    title: "Container networking",
    content: "Private container networking keeps application ports on loopback.",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  for (let index = 3; index < records; index += 1) {
    await runtime.brain.capture({
      actor,
      requestId: `benchmark-filler-${index}`,
      type: "note",
      title: `Operational note ${index}`,
      content: `Deterministic filler record ${index} covers unrelated operational topic group ${index % 17}.`,
      provenance: { source: "benchmark-corpus", ordinal: index },
      sensitivity: "private"
    });
  }
  return { english: english.artifact, thai: thai.artifact };
}

export function brainBenchmarkCases(targets: {
  english: BrainArtifactMetadata;
  thai: BrainArtifactMetadata;
}): BrainBenchmarkQuery[] {
  return [
    {
      name: "english-exact",
      query: "stale Docker layer cache",
      targetId: targets.english.id,
      required: true
    },
    {
      name: "thai-exact",
      query: "แคช Docker ค้าง",
      targetId: targets.thai.id,
      required: true
    },
    {
      name: "cross-language",
      query: "stale Docker cache",
      targetId: targets.thai.id,
      required: false
    }
  ];
}
