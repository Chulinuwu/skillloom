import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runBrainRetrievalBenchmark } from "../../src/benchmarks/brain-retrieval.js";

test("retrieval benchmark reports lexical and cross-language behavior without keeping fixtures", async () => {
  const result = await runBrainRetrievalBenchmark({
    records: 40,
    iterations: 2,
    keep: false
  });

  assert.equal(result.records, 40);
  assert.equal(result.cases.find(({ name }) => name === "english-exact")?.recallAt5, 1);
  assert.equal(result.cases.find(({ name }) => name === "thai-exact")?.recallAt5, 1);
  assert.equal(result.cases.find(({ name }) => name === "cross-language")?.required, false);
  assert.ok(result.metrics.ingestMs >= 0);
  assert.ok(result.metrics.coldStartMs >= 0);
  assert.ok(result.metrics.queryP95Ms >= result.metrics.queryP50Ms);
  assert.equal(result.workspaceRetained, false);
  assert.equal(result.resumed, false);
  await assert.rejects(() => stat(result.workspace), { code: "ENOENT" });
});

test("retrieval benchmark resumes an explicitly retained workspace", async () => {
  const parent = await mkdtemp(join(tmpdir(), "skillloom-benchmark-test-"));
  const workspace = join(parent, "retrieval");
  try {
    const first = await runBrainRetrievalBenchmark({
      records: 3,
      iterations: 1,
      keep: false,
      workspace
    });
    const resumed = await runBrainRetrievalBenchmark({
      records: 3,
      iterations: 1,
      keep: false,
      workspace
    });
    assert.equal(first.workspaceRetained, true);
    assert.equal(first.resumed, false);
    assert.equal(resumed.workspaceRetained, true);
    assert.equal(resumed.resumed, true);
    await assert.rejects(
      () => runBrainRetrievalBenchmark({
        records: 4,
        iterations: 1,
        keep: false,
        workspace
      }),
      /marker does not match/u
    );
    const occupied = join(parent, "occupied");
    await mkdir(occupied);
    await writeFile(join(occupied, "unrelated.txt"), "do not overwrite\n");
    await assert.rejects(
      () => runBrainRetrievalBenchmark({
        records: 3,
        iterations: 1,
        keep: false,
        workspace: occupied
      }),
      /not empty/u
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
