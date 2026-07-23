import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareObsidianWorkspace } from "../../src/host/obsidian-workspace.js";

test("Obsidian workspace migrates writable Bases and hidden projection staging paths", async () => {
  const vaultConfig = await mkdtemp(join(tmpdir(), "skillloom-obsidian-workspace-"));
  const workspacePath = join(vaultConfig, "workspace.json");
  await writeFile(workspacePath, JSON.stringify({
    active: "Library/Bases/Gaps and Conflicts.base",
    leaves: [
      { file: "Library.next/Bases/Knowledge.base" },
      { file: "Library.previous/human-knowledge/note/example.md" }
    ],
    untouched: "Library/human-knowledge/note/current.md"
  }));

  await prepareObsidianWorkspace(vaultConfig);

  assert.deepEqual(JSON.parse(await readFile(workspacePath, "utf8")), {
    active: "Bases/Gaps and Conflicts.base",
    leaves: [
      { file: "Bases/Knowledge.base" },
      { file: "Library/human-knowledge/note/example.md" }
    ],
    untouched: "Library/human-knowledge/note/current.md"
  });
});

test("Obsidian workspace migration preserves malformed state", async () => {
  const vaultConfig = await mkdtemp(join(tmpdir(), "skillloom-obsidian-workspace-malformed-"));
  const workspacePath = join(vaultConfig, "workspace.json");
  await mkdir(vaultConfig, { recursive: true });
  await writeFile(workspacePath, "{broken");

  await assert.rejects(() => prepareObsidianWorkspace(vaultConfig), /Obsidian workspace is malformed/u);
  assert.equal(await readFile(workspacePath, "utf8"), "{broken");
});
