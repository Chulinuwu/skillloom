import { test } from "node:test";
import { strict as assert } from "node:assert";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { captureCommand } from "../../src/commands/capture.js";
import { initCommand } from "../../src/commands/init.js";
import { promoteCommand } from "../../src/commands/promote.js";
import { PromotionPolicyError } from "../../src/domain/errors.js";
import { setMode } from "../../src/config/service.js";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";

test("promote command refuses unapproved CLI requests without an active mutation", async () => {
  const projectRoot = await tempDir("skillloom-cli-project-");
  const homeDir = await tempDir("skillloom-cli-home-");
  const source = await createSkillFixture();
  await initCommand({ command: "init", root: projectRoot, json: true });
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, projectRoot);
  await assert.rejects(() => promoteCommand({
    command: "promote",
    targetMode: "scoped",
    candidateId: candidate.candidateId,
    targets: ["codex"],
    scope: "user",
    yes: false,
    acceptWarnings: false,
    json: true
  }, projectRoot, homeDir), PromotionPolicyError);
  await assert.rejects(() => stat(join(homeDir, ".agents", "skills", candidate.metadata.name)), { code: "ENOENT" });
});

test("policy approval is mode-gated and limited to project targets", async () => {
  const projectRoot = await tempDir("skillloom-policy-project-");
  const homeDir = await tempDir("skillloom-policy-home-");
  const source = await createSkillFixture();
  await initCommand({ command: "init", root: projectRoot, json: true });
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, projectRoot);
  const request = {
    command: "promote" as const,
    targetMode: "scoped" as const,
    candidateId: candidate.candidateId,
    targets: ["claude" as const],
    scope: "project" as const,
    yes: false,
    policy: true,
    acceptWarnings: false,
    json: true
  };
  await assert.rejects(() => promoteCommand(request, projectRoot, homeDir), /manual mode/u);
  await setMode(projectRoot, "policy");
  const result = await promoteCommand(request, projectRoot, homeDir);
  assert.equal(result.result, "applied");
  const secondSource = await createSkillFixture();
  const second = await captureCommand({ command: "capture", source: secondSource, createdBy: "agent", evidence: [], json: true }, projectRoot);
  await assert.rejects(() => promoteCommand({ ...request, candidateId: second.candidateId, scope: "user" }, projectRoot, homeDir), /outside the project policy/u);
});
