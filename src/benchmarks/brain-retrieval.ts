import { performance } from "node:perf_hooks";
import { createEvaluationBrainRuntime } from "../evaluation/brain-runtime.js";
import {
  benchmarkActorId,
  brainBenchmarkCases,
  populateBrainBenchmarkCorpus
} from "./brain-corpus.js";
import type { BrainBenchmarkCase, BrainRetrievalBenchmarkResult } from "./types.js";
import { prepareRetrievalBenchmarkWorkspace } from "./workspace.js";

type EvaluationRuntime = Awaited<ReturnType<typeof createEvaluationBrainRuntime>>;

export async function runBrainRetrievalBenchmark(input: {
  records: number;
  iterations: number;
  keep: boolean;
  workspace?: string;
}): Promise<BrainRetrievalBenchmarkResult> {
  if (!Number.isSafeInteger(input.records) || input.records < 3) {
    throw new Error("Retrieval benchmark requires at least 3 records");
  }
  if (!Number.isSafeInteger(input.iterations) || input.iterations < 1) {
    throw new Error("Retrieval benchmark requires at least 1 iteration");
  }

  const workspace = await prepareRetrievalBenchmarkWorkspace(input);
  let runtime: EvaluationRuntime | null = null;
  try {
    const initialRuntime = await createEvaluationBrainRuntime(workspace.brainRoot, [benchmarkActorId]);
    runtime = initialRuntime;
    const ingestStarted = performance.now();
    const targets = await initialRuntime.runAs(
      benchmarkActorId,
      async () => await populateBrainBenchmarkCorpus(initialRuntime, input.records)
    );
    const ingestMs = elapsed(ingestStarted);
    await initialRuntime.close();
    runtime = null;

    const startupStarted = performance.now();
    const reopenedRuntime = await createEvaluationBrainRuntime(workspace.brainRoot, [benchmarkActorId]);
    runtime = reopenedRuntime;
    const coldStartMs = elapsed(startupStarted);
    const latencies: number[] = [];
    const cases = await reopenedRuntime.runAs(
      benchmarkActorId,
      async () => await evaluate(reopenedRuntime, targets, input.iterations, latencies)
    );
    return {
      command: "benchmark",
      kind: "retrieval",
      implementation: "fts5-bm25-graph",
      records: input.records,
      iterations: input.iterations,
      workspace: workspace.root,
      workspaceRetained: workspace.retained,
      resumed: workspace.resumed,
      cases,
      metrics: {
        ingestMs,
        coldStartMs,
        queryP50Ms: percentile(latencies, 0.5),
        queryP95Ms: percentile(latencies, 0.95)
      }
    };
  } finally {
    try {
      await runtime?.close();
    } finally {
      await workspace.cleanup();
    }
  }
}

async function evaluate(
  runtime: EvaluationRuntime,
  targets: Parameters<typeof brainBenchmarkCases>[0],
  iterations: number,
  latencies: number[]
): Promise<BrainBenchmarkCase[]> {
  const results: BrainBenchmarkCase[] = [];
  for (const benchmarkCase of brainBenchmarkCases(targets)) {
    let rank: number | null = null;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance.now();
      const retrieved = await runtime.brain.retrieve({
        actor: runtime.actor(benchmarkActorId),
        query: benchmarkCase.query,
        tier: "quick",
        limit: 5
      });
      latencies.push(performance.now() - started);
      const currentRank = retrieved.results.findIndex(({ id }) => id === benchmarkCase.targetId);
      if (currentRank >= 0) {
        rank = rank === null ? currentRank + 1 : Math.min(rank, currentRank + 1);
      }
    }
    results.push({
      name: benchmarkCase.name,
      query: benchmarkCase.query,
      required: benchmarkCase.required,
      recallAt5: rank === null ? 0 : 1,
      rank
    });
  }
  return results;
}

function elapsed(started: number): number {
  return Number((performance.now() - started).toFixed(2));
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return Number((sorted[index] ?? 0).toFixed(2));
}
