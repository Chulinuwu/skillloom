import { strict as assert } from "node:assert";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { collectPackageFiles } from "../../src/files/tree.js";
import { hashPackage } from "../../src/skills/hash.js";
import { tempDir } from "../helpers/fixtures.js";

test("package integrity changes when file permissions change", async () => {
  const root = await tempDir("skillloom-mode-hash-");
  await mkdir(join(root, "scripts"));
  const script = join(root, "scripts", "run.sh");
  await writeFile(join(root, "SKILL.md"), "---\nname: mode-hash\ndescription: Test mode hashing.\n---\n");
  await writeFile(script, "echo ok\n");
  await chmod(script, 0o644);
  const before = await hashPackage(await collectPackageFiles(root));

  await chmod(script, 0o755);
  const after = await hashPackage(await collectPackageFiles(root));

  assert.notEqual(after, before);
});
