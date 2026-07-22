import assert from "node:assert/strict";
import test from "node:test";
import { formatOutput } from "../../src/cli/output.js";
import { modeProfileFor } from "../../src/config/mode-profile.js";

test("human mode output exposes the resolved automation profile", () => {
  const output = formatOutput({ mode: "hermes", policy: {}, automation: modeProfileFor("hermes") }, false);
  assert.match(output, /^mode: hermes$/mu);
  assert.match(output, /^automation: review=task-end brain=auto-curated retrieval=auto-bounded promotion=policy hosts=claude:automatic,codex:invoked,agents:invoked$/mu);
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
  assert.match(output, /^automation: review=manual brain=manual retrieval=explicit promotion=manual hosts=claude:invoked,codex:invoked,agents:invoked$/mu);
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
          authoring: { path: "Authoring", access: "writable-staging" }
        }
      }
    }
  }, false);
  assert.match(output, /^obsidian: .*Library read-only, Authoring writable-staging\)$/mu);
});
