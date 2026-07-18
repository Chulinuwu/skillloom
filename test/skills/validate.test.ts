import { test } from "node:test";
import { strict as assert } from "node:assert";
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSkillFixture, tempDir } from "../helpers/fixtures.js";
import { PathPolicyError } from "../../src/domain/errors.js";
import { validateSkillPackage } from "../../src/skills/validate.js";

test("accepts a safe Agent Skills package", async () => {
  const dir = await createSkillFixture();
  const result = await validateSkillPackage(dir);
  assert.equal(result.metadata.name, "safe-skill");
  assert.equal(result.files.map((file) => file.relativePath).join(","), "SKILL.md,references/checklist.md,scripts/noop.sh");
});

test("rejects missing SKILL.md", async () => {
  const dir = await tempDir();
  await assert.rejects(() => validateSkillPackage(dir), /SKILL.md/);
});

test("source validation rejects folder name mismatch", async () => {
  const root = await tempDir();
  const dir = await createSkillFixture(join(root, "wrong-name"));
  await assert.rejects(() => validateSkillPackage(dir, { folderNamePolicy: "match-metadata" }), /folder name/);
});

test("snapshot validation accepts generic skill folder with expected name", async () => {
  const root = await tempDir();
  const dir = await createSkillFixture(join(root, "skill"));
  const result = await validateSkillPackage(dir, { expectedName: "safe-skill" });
  assert.equal(result.metadata.name, "safe-skill");
});

test("rejects symlinks", async () => {
  const dir = await createSkillFixture();
  await symlink("/etc/hosts", join(dir, "references", "hosts"));
  await assert.rejects(() => validateSkillPackage(dir), PathPolicyError);
});

test("rejects binary files", async () => {
  const dir = await createSkillFixture();
  await writeFile(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3]));
  await assert.rejects(() => validateSkillPackage(dir), /binary/);
});

test("rejects oversized files", async () => {
  const dir = await createSkillFixture();
  await writeFile(join(dir, "references", "large.md"), "x".repeat(513 * 1024));
  await assert.rejects(() => validateSkillPackage(dir), /size limit/);
});

test("rejects invalid skill names", async () => {
  const dir = await tempDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), "---\nname: Bad Name\ndescription: x\n---\n");
  await assert.rejects(() => validateSkillPackage(dir), /Invalid skill name/);
});

test("rejects missing local resource references", async () => {
  const dir = await createSkillFixture();
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Read [the missing guide](references/missing.md).",
    ""
  ].join("\n"));
  await assert.rejects(() => validateSkillPackage(dir), /Referenced resource does not exist: references\/missing\.md/);
});

test("rejects path-escaping and ambiguous local resource references", async () => {
  const dir = await createSkillFixture();
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Run `scripts/../../outside.sh`.",
    ""
  ].join("\n"));
  await assert.rejects(() => validateSkillPackage(dir), /escapes skill package/);

  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Read ../references/outside.md before continuing.",
    ""
  ].join("\n"));
  await assert.rejects(() => validateSkillPackage(dir), /escapes skill package/);

  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "See [the script](scripts/noop.sh?generated=true).",
    ""
  ].join("\n"));
  await assert.rejects(() => validateSkillPackage(dir), /Ambiguous local resource reference/);
});

test("ignores URLs, anchors, command flags, and fenced generated output", async () => {
  const dir = await createSkillFixture();
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "See [remote docs](https://example.com/references/missing.md), [this section](#scripts/missing.sh), and [the readme](README.md).",
    "Use `--output=assets/generated.png` when needed.",
    "Run the command with --output assets/generated.png.",
    "Output: templates/missing.md",
    "```text",
    "generated: templates/missing.md",
    "```",
    ""
  ].join("\n"));
  const result = await validateSkillPackage(dir);
  assert.equal(result.metadata.name, "safe-skill");
});

test("accepts normalized Markdown, plain, and backtick resource references", async () => {
  const dir = await createSkillFixture();
  await mkdir(join(dir, "assets"));
  await mkdir(join(dir, "templates"));
  await writeFile(join(dir, "assets", "icon.txt"), "icon\n");
  await writeFile(join(dir, "templates", "report template.md"), "report\n");
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Read [the checklist](./references/checklist.md#steps).",
    "Run `scripts/./noop.sh`.",
    "Use assets/icon.txt as the fixture.",
    "Render [the report][report].",
    "[report]: <templates/report template.md> \"Report template\"",
    ""
  ].join("\n"));
  const result = await validateSkillPackage(dir);
  assert.deepEqual(result.references.map((reference) => reference.path), [
    "references/checklist.md",
    "scripts/noop.sh",
    "assets/icon.txt",
    "templates/report template.md"
  ]);
});

test("blocks executable resources that are not declared in SKILL.md", async () => {
  const dir = await createSkillFixture();
  await chmod(join(dir, "scripts", "noop.sh"), 0o755);
  const result = await validateSkillPackage(dir);
  const script = result.files.find((file) => file.relativePath === "scripts/noop.sh");
  assert.ok(script);
  assert.equal(script.mode & 0o111, 0o111);
  assert.deepEqual(result.findings.filter((finding) => finding.ruleId === "undeclared-executable"), [{
    ruleId: "undeclared-executable",
    severity: "danger",
    file: "scripts/noop.sh",
    line: 1,
    message: "Executable file must be declared by its exact local path in SKILL.md"
  }]);
});

test("allows declared executables while still scanning their content", async () => {
  const dir = await createSkillFixture();
  await chmod(join(dir, "scripts", "noop.sh"), 0o755);
  await writeFile(join(dir, "scripts", "noop.sh"), "rm -rf ./cache\n", { mode: 0o755 });
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Run `scripts/noop.sh`.",
    ""
  ].join("\n"));
  const result = await validateSkillPackage(dir);
  assert.equal(result.findings.some((finding) => finding.ruleId === "undeclared-executable"), false);
  assert.equal(result.findings.some((finding) => finding.ruleId === "destructive-shell" && finding.file === "scripts/noop.sh"), true);
});

test("accepts CRLF frontmatter", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: crlf-skill",
    "description: Supports Windows line endings.",
    "---",
    ""
  ].join("\r\n"));

  const result = await validateSkillPackage(dir);

  assert.equal(result.metadata.name, "crlf-skill");
});

test("parses a capability manifest from frontmatter", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: capability-skill",
    "description: Declares required host capabilities.",
    "capabilities: [filesystem-read, network]",
    "---",
    ""
  ].join("\n"));

  const result = await validateSkillPackage(dir);

  assert.deepEqual(result.metadata.capabilities, ["filesystem-read", "network"]);
});

test("blocks executable SKILL.md", async () => {
  const dir = await createSkillFixture();
  await chmod(join(dir, "SKILL.md"), 0o755);
  const result = await validateSkillPackage(dir);
  assert.equal(result.findings.some((finding) => finding.ruleId === "undeclared-executable" && finding.file === "SKILL.md"), true);
});
