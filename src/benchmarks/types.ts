export type BrainBenchmarkCase = Readonly<{
  name: "english-exact" | "thai-exact" | "cross-language";
  query: string;
  required: boolean;
  recallAt5: 0 | 1;
  rank: number | null;
}>;

export type BrainRetrievalBenchmarkResult = Readonly<{
  command: "benchmark";
  kind: "retrieval";
  implementation: "fts5-bm25-graph";
  records: number;
  iterations: number;
  workspace: string;
  workspaceRetained: boolean;
  resumed: boolean;
  cases: readonly BrainBenchmarkCase[];
  metrics: {
    ingestMs: number;
    coldStartMs: number;
    queryP50Ms: number;
    queryP95Ms: number;
  };
}>;
