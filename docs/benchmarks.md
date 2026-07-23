# Retrieval benchmark

The retrieval benchmark is an evaluation harness for the current Brain implementation. It is not a production-capacity claim.

## What it runs

The harness uses the real canonical Markdown source store, SQLite FTS5/BM25 index, graph-aware retrieval service, authorization boundary, and startup rebuild path.

Each corpus contains:

- One English target about a stale Docker layer cache.
- One Thai target about the same operational class.
- One related distractor.
- Deterministic unrelated filler records.

The benchmark closes the Brain after ingestion and opens it again before querying. It reports ingest time, cold-start time, query p50 and p95, exact English recall, exact Thai recall, and informational cross-language recall.

Exact English and Thai cases are required. The cross-language case is informational because the current retrieval path is lexical. A miss there is a recorded limitation, not a hidden failure.

## Run it

```bash
npm run benchmark:retrieval -- --records 1000 --iterations 5
```

For larger or interruptible runs, use an explicit workspace:

```bash
npm run benchmark:retrieval -- \
  --records 10000 \
  --iterations 5 \
  --workspace /tmp/skillloom-retrieval-10k
```

The workspace contains a private marker bound to the corpus schema and requested record count. Captures use deterministic idempotency keys. Rerunning the same command continues the same corpus safely. A mismatched record count or schema is rejected.

Without `--workspace`, the harness creates a temporary directory and removes it after success or handled failure. Add `--keep` to retain an automatically created workspace for inspection.

## How to interpret results

Compare runs only when hardware, Node.js version, filesystem, corpus size, iteration count, and repository revision are equivalent. Ingest time on a resumed workspace measures idempotent replay, not first ingestion.

The current harness does not measure semantic retrieval, reranking, temporal decay, source trust weighting, contradiction or entity resolution, attachment throughput, multiple writers, end-to-end task time, or token savings.

Those require separate datasets and acceptance criteria. Until then, README claims stay limited to lexical FTS5/BM25 retrieval plus graph expansion.
