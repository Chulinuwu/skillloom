import { test } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { agentsAdapter } from "../../src/adapters/agents.js";
import { genericAdapter } from "../../src/adapters/generic.js";
import { getAdapter } from "../../src/adapters/registry.js";
import { PathPolicyError, UsageError } from "../../src/domain/errors.js";

const context = {
  projectRoot: "/tmp/project",
  homeDir: "/tmp/home",
  genericDestination: "/tmp/custom-skills"
};

test("resolves exact Claude Code project and user destinations", () => {
  assert.equal(claudeCodeAdapter.resolveDestination(context, "project", "safe-skill"), join(context.projectRoot, ".claude", "skills", "safe-skill"));
  assert.equal(claudeCodeAdapter.resolveDestination(context, "user", "safe-skill"), join(context.homeDir, ".claude", "skills", "safe-skill"));
});

test("resolves exact Codex project and user destinations", () => {
  assert.equal(codexAdapter.resolveDestination(context, "project", "safe-skill"), join(context.projectRoot, ".agents", "skills", "safe-skill"));
  assert.equal(codexAdapter.resolveDestination(context, "user", "safe-skill"), join(context.homeDir, ".agents", "skills", "safe-skill"));
});

test("resolves exact portable Agent Skills project and user destinations", () => {
  assert.equal(agentsAdapter.resolveDestination(context, "project", "safe-skill"), join(context.projectRoot, ".agents", "skills", "safe-skill"));
  assert.equal(agentsAdapter.resolveDestination(context, "user", "safe-skill"), join(context.homeDir, ".agents", "skills", "safe-skill"));
});
test("generic adapter requires and uses an explicit destination root", () => {
  assert.equal(genericAdapter.resolveDestination(context, "/tmp/custom-skills", "safe-skill"), join(context.genericDestination, "safe-skill"));
  assert.equal(genericAdapter.resolveDestination(context, "portable-skills", "safe-skill"), join(context.projectRoot, "portable-skills", "safe-skill"));
});
test("generic adapter rejects unsafe or ambiguous destination roots", () => {
  for (const destinationRoot of ["", " ", ".", "..", "../outside", "portable/../outside", "./portable", "/", ".skillloom", ".skillloom/skills"]) {
    assert.throws(() => genericAdapter.resolveDestination(context, destinationRoot, "safe-skill"), PathPolicyError);
  }
  assert.throws(() => genericAdapter.resolveDestination({ projectRoot: "relative-project", homeDir: context.homeDir }, "portable", "safe-skill"), PathPolicyError);
});

test("rejects unsafe skill names before resolving a native destination", () => {
  for (const skillName of ["../escape", "nested/escape", "/absolute", ".", "UPPERCASE"]) {
    assert.throws(() => claudeCodeAdapter.resolveDestination(context, "project", skillName), PathPolicyError);
    assert.throws(() => codexAdapter.resolveDestination(context, "user", skillName), PathPolicyError);
  }
});

test("registry rejects unknown target names instead of falling back", () => {
  assert.equal(getAdapter("agents"), agentsAdapter);
  assert.throws(() => getAdapter("unknown"), UsageError);
});
