import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArguments } from "../../src/cli/arguments.js";

test("parses init with defaults", () => {
  assert.deepEqual(parseArguments(["init"]), {
    command: "init",
    root: process.cwd(),
    json: false
  });
});

test("parses capture evidence and json", () => {
  assert.deepEqual(parseArguments(["capture", "pkg", "--created-by", "agent", "--evidence", "task:42", "--json"]), {
    command: "capture",
    source: "pkg",
    createdBy: "agent",
    evidence: ["task:42"],
    json: true
  });
});
test("parses capture base and recovery commands", () => {
  assert.deepEqual(parseArguments(["capture", "pkg", "--base", "installed"]), {
    command: "capture",
    source: "pkg",
    createdBy: "agent",
    evidence: [],
    base: "installed",
    json: false
  });
  assert.deepEqual(parseArguments(["resume", "op-1", "--yes"]), {
    command: "resume",
    operationId: "op-1",
    yes: true,
    json: false
  });
  assert.deepEqual(parseArguments(["rollback", "promo-1", "--yes", "--force"]), {
    command: "rollback",
    promotionId: "promo-1",
    yes: true,
    force: true,
    json: false
  });
});
test("parses explicit journal lock recovery", () => {
  assert.deepEqual(parseArguments(["recover-lock", "journal", "--yes"]), {
    command: "recover-lock", lock: "journal", yes: true, json: false
  });
});

test("parses validate and status", () => {
  assert.deepEqual(parseArguments(["validate", "cand-1"]), { command: "validate", candidateId: "cand-1", json: false });
  assert.deepEqual(parseArguments(["status", "--json"]), { command: "status", json: true });
});

test("rejects unknown flags", () => {
  assert.throws(() => parseArguments(["init", "--bad"]), /Unknown flag/);
});
test("parses zero-config setup, sync, and bridge commands", () => {
  assert.deepEqual(parseArguments(["setup", "--target", "auto", "--hub", "auto", "--scope", "user", "--yes", "--json"]), {
    command: "setup",
    target: "auto",
    hub: "auto",
    scope: "user",
    yes: true,
    json: true
  });
  assert.deepEqual(parseArguments(["setup"]), {
    command: "setup",
    target: "auto",
    hub: "auto",
    scope: "user",
    yes: false,
    json: false
  });
  assert.deepEqual(parseArguments(["setup", "--hub", "local", "--target", "agents"]), {
    command: "setup",
    target: "agents",
    hub: "local",
    scope: "user",
    yes: false,
    json: false
  });
  assert.deepEqual(parseArguments(["sync", "--apply", "--json"]), {
    command: "sync",
    apply: true,
    json: true
  });
  assert.deepEqual(parseArguments(["bridge", "--stdio"]), {
    command: "bridge",
    stdio: true,
    json: false
  });
});
test("setup rejects secret-bearing and endpoint override flags", () => {
  for (const flag of ["--url", "--token", "--vault", "--db"]) {
    assert.throws(() => parseArguments(["setup", flag, "value"]), new RegExp(`Unknown flag: ${flag}`, "u"));
  }
  assert.throws(() => parseArguments(["setup", "--hub", "https://hub.example.com"]), /--hub must be auto or local/u);
  assert.throws(() => parseArguments(["bridge"]), /requires --stdio/u);
  assert.throws(() => parseArguments(["bridge", "--stdio", "--json"]), /does not support --json/u);
});

test("parses a multi-target promotion", () => {
  assert.deepEqual(parseArguments(["promote", "cand-1", "--target", "claude,codex", "--yes"]), {
    command: "promote",
    targetMode: "scoped",
    candidateId: "cand-1",
    targets: ["claude", "codex"],
    scope: "project",
    yes: true,
    acceptWarnings: false,
    json: false
  });
});
test("parses learning modes and policy approval", () => {
  assert.deepEqual(parseArguments(["mode", "hermes", "--json"]), { command: "mode", mode: "hermes", json: true });
  assert.deepEqual(parseArguments(["journey"]), { command: "journey", json: false });
  assert.deepEqual(parseArguments(["observe", "--source", "codex", "--outcome", "no-op", "--summary", "nothing reusable"]), {
    command: "observe", source: "codex", outcome: "no-op", summary: "nothing reusable", json: false
  });
  assert.deepEqual(parseArguments(["promote", "cand-1", "--target", "codex", "--policy"]), {
    command: "promote", targetMode: "scoped", candidateId: "cand-1", targets: ["codex"], scope: "project",
    yes: false, acceptWarnings: false, policy: true, json: false
  });
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "codex", "--yes", "--policy"]), /either --yes or --policy/u);
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "codex", "--policy", "--accept-warnings"]), /cannot be combined/u);
});
test("requires a promotion target", () => {
  assert.throws(() => parseArguments(["promote", "cand-1", "--yes"]), /target/);
});

test("normalizes duplicate promotion targets in stable native order", () => {
  const command = parseArguments(["promote", "cand-1", "--target", "codex,claude,codex", "--yes"]);
  assert.equal(command.command, "promote");
  assert.deepEqual(command.targets, ["claude", "codex"]);
});

test("parses the portable agents target", () => {
  assert.deepEqual(parseArguments(["promote", "cand-1", "--target", "agents", "--scope", "user", "--yes"]), {
    command: "promote",
    targetMode: "scoped",
    candidateId: "cand-1",
    targets: ["agents"],
    scope: "user",
    yes: true,
    acceptWarnings: false,
    json: false
  });
});

test("parses a generic explicit-directory promotion without a harness scope", () => {
  assert.deepEqual(parseArguments(["promote", "cand-1", "--target", "generic", "--destination", "portable-skills", "--yes"]), {
    command: "promote",
    targetMode: "directory",
    candidateId: "cand-1",
    targets: ["generic"],
    destinationRoot: "portable-skills",
    yes: true,
    acceptWarnings: false,
    json: false
  });
});

test("rejects ambiguous generic target combinations", () => {
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "generic", "--yes"]), /requires --destination/);
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "generic", "--destination", "skills", "--scope", "project", "--yes"]), /does not accept --scope/);
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "agents,generic", "--destination", "skills", "--yes"]), /cannot be combined/);
  assert.throws(() => parseArguments(["promote", "cand-1", "--target", "agents", "--destination", "skills", "--yes"]), /only valid for the generic target/);
});

test("parses doctor targets and preserves first-class harness defaults", () => {
  assert.deepEqual(parseArguments(["doctor"]), {
    command: "doctor",
    targetMode: "scoped",
    targets: ["claude", "codex"],
    json: false
  });
  assert.deepEqual(parseArguments(["doctor", "--target", "codex,claude,codex", "--json"]), {
    command: "doctor",
    targetMode: "scoped",
    targets: ["claude", "codex"],
    json: true
  });
});

test("doctor accepts agents and requires an explicit root for generic", () => {
  assert.deepEqual(parseArguments(["doctor", "--target", "agents"]), {
    command: "doctor",
    targetMode: "scoped",
    targets: ["agents"],
    json: false
  });
  assert.deepEqual(parseArguments(["doctor", "--target", "generic", "--destination", "portable-skills"]), {
    command: "doctor",
    targetMode: "directory",
    targets: ["generic"],
    destinationRoot: "portable-skills",
    json: false
  });
  assert.throws(() => parseArguments(["doctor", "--target", "generic"]), /requires --destination/);
  assert.throws(() => parseArguments(["doctor", "--target", "agents,generic", "--destination", "skills"]), /cannot be combined/);
  assert.throws(() => parseArguments(["doctor", "--target", "other"]), /Unknown target/);
});
