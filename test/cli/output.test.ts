import assert from "node:assert/strict";
import test from "node:test";
import { formatOutput } from "../../src/cli/output.js";
import { modeProfileFor } from "../../src/config/mode-profile.js";

test("human mode output exposes the resolved automation profile", () => {
  const output = formatOutput({ mode: "hermes", policy: {}, automation: modeProfileFor("hermes") }, false);
  assert.match(output, /^mode: hermes$/mu);
  assert.match(output, /^automation: review=meaningful-delta brain=auto-curated retrieval=auto-bounded context=automatic promotion=policy hosts=claude:automatic,codex:invoked,agents:invoked$/mu);
});

test("human status output exposes the resolved automation profile", () => {
  const output = formatOutput({
    mode: "manual",
    automation: modeProfileFor("manual"),
    learning: [],
    candidates: [],
    promotions: [],
    events: [],
    operations: [],
    lock: { state: "unlocked" }
  }, false);
  assert.match(output, /^mode: manual$/mu);
  assert.match(output, /^automation: review=manual brain=manual retrieval=explicit context=automatic promotion=manual hosts=claude:invoked,codex:invoked,agents:invoked$/mu);
});

test("setup output prints source-bound evidence and redacts secret snippets", () => {
  const output = formatOutput({
    command: "setup",
    hub: { mode: "local-only" },
    host: null,
    surfaces: null,
    targets: [],
    reconciled: null,
    plan: {
      role: "client-node",
      status: "needs-human",
      environment: { tailscale: "needs-login", docker: "available" },
      sources: [{
        kind: "cli-help",
        title: "tailscale serve --help",
        fetchedAt: "2026-07-22T00:00:00.000Z",
        contentHash: "sha256:test",
        snippets: ["run TS_AUTHKEY=tskey-secret tailscale serve"]
      }],
      steps: [{ id: "trust-hub", title: "Trust Hub", action: "human", verification: "verified", sourceTitles: ["tailscale serve --help"] }],
      checkpoints: ["environment-detected"],
      warnings: []
    }
  }, false);
  assert.match(output, /^role: client-node \(needs-human\)$/mu);
  assert.match(output, /^evidence: tailscale serve --help: run TS_AUTHKEY=<redacted> tailscale serve$/mu);
  assert.match(output, /^human: Trust Hub source=tailscale serve --help$/mu);
  assert.doesNotMatch(output, /tskey-secret/u);
});

test("host output distinguishes the read-only Library from writable Authoring staging", () => {
  const output = formatOutput({
    command: "host",
    action: "status",
    status: "running",
    root: "/host",
    policyPath: "/host/policy.hujson",
    nextActions: [],
    surfaces: {
      hub: { url: "https://skillloom.example.ts.net", externalPort: 443, internalPort: 8787, access: "read-write" },
      obsidian: {
        url: "https://skillloom.example.ts.net:8443",
        externalPort: 8443,
        internalPort: 3000,
        workspaces: {
          library: { path: "Library", access: "read-only" },
          dashboards: { path: "Bases", access: "writable-ui-state" },
          authoring: { path: "Authoring", access: "writable-staging" }
        }
      }
    }
  }, false);
  assert.match(output, /^obsidian: .*Library read-only, Bases writable-ui-state, Authoring writable-staging\)$/mu);
});

test("demo and benchmark output expose proof and measured limits", () => {
  const demo = formatOutput({
    command: "demo",
    workspace: "/tmp/demo",
    workspaceRetained: false,
    durationMs: 10,
    checks: [{ name: "cross-agent-retrieval", status: "passed", evidence: "artifact ranked first" }],
    summary: { passed: 1, failed: 0 }
  }, false);
  assert.match(demo, /^demo: 1\/1 checks passed$/mu);
  assert.match(demo, /^\[passed\] cross-agent-retrieval: artifact ranked first$/mu);
  assert.match(demo, /^workspace: removed$/mu);

  const benchmark = formatOutput({
    command: "benchmark",
    kind: "retrieval",
    implementation: "fts5-bm25-graph",
    records: 1000,
    iterations: 5,
    workspace: "/tmp/benchmark",
    workspaceRetained: false,
    resumed: false,
    cases: [{ name: "cross-language", query: "stale Docker cache", required: false, recallAt5: 0, rank: null }],
    metrics: { ingestMs: 200, coldStartMs: 20, queryP50Ms: 2, queryP95Ms: 4 }
  }, false);
  assert.match(benchmark, /^retrieval benchmark: 1000 records, 5 iteration\(s\)$/mu);
  assert.match(benchmark, /^\[informational\] cross-language: recall@5=0 rank=none$/mu);
  assert.match(benchmark, /^latency: query p50=2 ms p95=4 ms, cold start=20 ms, ingest=200 ms$/mu);
  assert.match(benchmark, /^run: new workspace$/mu);
});
