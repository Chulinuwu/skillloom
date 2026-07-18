import { strict as assert } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { stageCandidateSnapshot } from "../src/store/candidate-snapshot.js";
import { createSkillFixture, tempDir } from "./helpers/fixtures.js";

test("capture validation reads an isolated source snapshot", async () => {
  const root = await tempDir("skillloom-snapshot-root-");
  const source = await createSkillFixture();
  const sourceScript = join(source, "scripts", "noop.sh");
  await writeFile(sourceScript, "echo before\n");

  const snapshot = await stageCandidateSnapshot(root, "op-capture-test", source);
  await writeFile(sourceScript, "echo after\n");

  assert.equal(await readFile(join(snapshot.skillRoot, "scripts", "noop.sh"), "utf8"), "echo before\n");
});
