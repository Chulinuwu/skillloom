import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../../src/files/atomic-write.js";
import { tempDir } from "../helpers/fixtures.js";

test("atomic write durably replaces a file without temporary residue", async () => {
  const root = await tempDir("skillloom-atomic-");
  const path = join(root, "record.json");
  await atomicWriteFile(path, "first\n");
  await atomicWriteFile(path, "second\n");
  assert.equal(await readFile(path, "utf8"), "second\n");
  assert.deepEqual((await readdir(root)).filter((name) => name.startsWith(".tmp-")), []);
});
