import { test } from "node:test";
import { strict as assert } from "node:assert";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { validateCommand } from "../../src/commands/validate.js";
import { readCandidate, stateAfterValidation, updateCandidateValidation, writeCandidateSnapshot } from "../../src/store/candidates.js";
import { appendEvent, readEvents } from "../../src/store/journal.js";
import { ValidationError } from "../../src/domain/errors.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";
import { statusCommand } from "../../src/commands/status.js";

test("validate revalidates snapshot and records phases", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await initCommand({ command: "init", root, json: true });
  const captured = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: ["task:1"], json: true }, root);
  const validated = await validateCommand({ command: "validate", candidateId: captured.candidateId, json: true }, root);
  assert.equal(validated.candidateId, captured.candidateId);
  assert.equal(validated.operationId, captured.operationId);
  assert.equal((await readCandidate(root, captured.candidateId)).state, "validated");
  const status = await statusCommand({ command: "status", json: true }, root);
  assert.equal(status.candidates.find((candidate) => candidate.candidateId === captured.candidateId)?.state, "validated");
  const validationEvents = (await readEvents(root)).filter((event) => event.kind === "validate");
  assert.notEqual(validationEvents[0]?.operationId, captured.operationId);
  const phases = validationEvents.map((event) => event.phase);
  assert.deepEqual(phases, ["started", "validated", "completed"]);
});

test("validate persists blocked state when danger findings exist", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await writeFile(join(source, "scripts", "noop.sh"), "rm -rf ./cache\n");
  await initCommand({ command: "init", root, json: true });
  const captured = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: ["task:danger"], json: true }, root);
  const validated = await validateCommand({ command: "validate", candidateId: captured.candidateId, json: true }, root);
  assert.equal(validated.state, "blocked");
  assert.equal((await readCandidate(root, captured.candidateId)).state, "blocked");
});

test("capture preserves declared executable mode for later validation", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await chmod(join(source, "scripts", "noop.sh"), 0o755);
  await writeFile(join(source, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Run `scripts/noop.sh`.",
    ""
  ].join("\n"));
  await initCommand({ command: "init", root, json: true });
  const captured = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, root);
  const validated = await validateCommand({ command: "validate", candidateId: captured.candidateId, json: true }, root);
  assert.equal(validated.state, "validated");
  assert.equal(validated.findings.some((finding) => finding.ruleId === "undeclared-executable"), false);
});

test("validate fails on snapshot tampering", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await initCommand({ command: "init", root, json: true });
  const captured = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: ["task:1"], json: true }, root);
  await writeFile(join(root, ".skillloom", "candidates", captured.candidateId, "skill", "SKILL.md"), "---\nname: other-skill\ndescription: changed\n---\n");
  await assert.rejects(() => validateCommand({ command: "validate", candidateId: captured.candidateId, json: true }, root), ValidationError);
  const failed = (await readEvents(root)).filter((event) => event.kind === "validate").at(-1);
  assert.equal(failed?.phase, "failed");
});

test("candidate snapshots are create-once", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await mkdir(join(root, ".skillloom", "candidates"), { recursive: true });
  const record = {
    candidateId: "cand-fixed",
    operationId: "op-fixed",
    state: "captured" as const,
    metadata: { name: "safe-skill", description: "Capture safe reusable workflow evidence." },
    packageHash: "hash",
    createdAt: new Date().toISOString(),
    createdBy: "agent" as const,
    evidence: [],
    findings: [],
    base: { kind: "none" as const }
  };
  const validation = await import("../../src/skills/validate.js").then(({ validateSkillPackage }) => validateSkillPackage(source));
  await writeCandidateSnapshot(root, record, validation.files);
  await assert.rejects(() => writeCandidateSnapshot(root, record, validation.files), /already exists/);
  assert.equal(await readFile(join(root, ".skillloom", "candidates", "cand-fixed", "candidate.json"), "utf8").then(Boolean), true);
});

test("candidate validation updates preserve provenance and terminal states", async () => {
  const root = await tempDir();
  const source = await createSkillFixture();
  await mkdir(join(root, ".skillloom", "candidates"), { recursive: true });
  const validation = await import("../../src/skills/validate.js").then(({ validateSkillPackage }) => validateSkillPackage(source));
  const record = {
    candidateId: "cand-terminal",
    operationId: "op-capture-original",
    state: "promoted" as const,
    metadata: validation.metadata,
    packageHash: validation.packageHash,
    createdAt: "2026-07-18T00:00:00.000Z",
    createdBy: "human" as const,
    evidence: ["task:original"],
    findings: [],
    base: { kind: "installed" as const, path: "/installed/safe-skill", hash: "base-hash" }
  };
  await writeCandidateSnapshot(root, record, validation.files);
  const updated = await updateCandidateValidation(root, record.candidateId, [{
    ruleId: "test-danger",
    severity: "danger",
    file: "SKILL.md",
    line: 1,
    message: "test"
  }]);
  assert.deepEqual(updated, record);
  assert.deepEqual(await readCandidate(root, record.candidateId), record);
});

test("validation state transitions are explicit for every lifecycle state", () => {
  const danger = [{
    ruleId: "test-danger",
    severity: "danger" as const,
    file: "SKILL.md",
    line: 1,
    message: "test"
  }];
  assert.equal(stateAfterValidation("captured", []), "validated");
  assert.equal(stateAfterValidation("captured", danger), "blocked");
  assert.equal(stateAfterValidation("validated", danger), "blocked");
  assert.equal(stateAfterValidation("blocked", []), "validated");
  assert.equal(stateAfterValidation("promoted", danger), "promoted");
  assert.equal(stateAfterValidation("superseded", []), "superseded");
});

test("journal sequences stay unique under concurrent appends", async () => {
  const root = await tempDir();
  await Promise.all(Array.from({ length: 20 }, (_unused, index) => appendEvent(root, {
    operationId: `op-${index}`,
    kind: "status",
    phase: "completed"
  })));
  const sequences = (await readEvents(root)).map((event) => event.sequence);
  assert.deepEqual(sequences, Array.from({ length: 20 }, (_unused, index) => index + 1));
});
