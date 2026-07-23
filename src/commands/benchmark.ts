import type { Command } from "../domain/types.js";
import { runBrainRetrievalBenchmark } from "../benchmarks/brain-retrieval.js";

export async function benchmarkCommand(command: Extract<Command, { command: "benchmark" }>) {
  return await runBrainRetrievalBenchmark(command);
}
