import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareObsidianProfile } from "../../src/host/obsidian-profile.js";

test("Obsidian profile opens Skillloom while preserving existing profile data", async () => {
  const configRoot = await mkdtemp(join(tmpdir(), "skillloom-obsidian-profile-"));
  const profileDirectory = join(configRoot, ".config", "obsidian");
  const profilePath = join(profileDirectory, "obsidian.json");
  await mkdir(profileDirectory, { recursive: true });
  await writeFile(profilePath, JSON.stringify({
    custom: "kept",
    vaults: {
      legacy: { path: "/config/Documents/Other", ts: 1, open: true }
    }
  }));

  await prepareObsidianProfile(configRoot, 42);

  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  assert.equal(profile.custom, "kept");
  assert.equal(profile.vaults.legacy.open, false);
  assert.deepEqual(
    Object.values(profile.vaults).find((value) => value.path === "/config/Documents/Skillloom"),
    { path: "/config/Documents/Skillloom", ts: 42, open: true }
  );
});

test("Obsidian profile preparation refuses to overwrite malformed state", async () => {
  const configRoot = await mkdtemp(join(tmpdir(), "skillloom-obsidian-profile-malformed-"));
  const profileDirectory = join(configRoot, ".config", "obsidian");
  const profilePath = join(profileDirectory, "obsidian.json");
  await mkdir(profileDirectory, { recursive: true });
  await writeFile(profilePath, "{broken");

  await assert.rejects(() => prepareObsidianProfile(configRoot), /Obsidian profile is malformed/u);
  assert.equal(await readFile(profilePath, "utf8"), "{broken");
});
