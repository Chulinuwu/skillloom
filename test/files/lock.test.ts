import { strict as assert } from "node:assert";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { readLockOwnerDiagnostic } from "../../src/files/lock-owner.js";
import { withStoreLock } from "../../src/files/lock.js";
import { tempDir } from "../helpers/fixtures.js";

test("a live lock owner never becomes stale because of age alone", async () => {
  const root = await tempDir("skillloom-live-lock-");
  const lock = join(root, "lock");
  await mkdir(lock);
  await writeFile(join(lock, "lock.json"), JSON.stringify({
    pid: process.pid,
    createdAt: "2000-01-01T00:00:00.000Z",
    operationId: "op-live",
    context: "test"
  }));

  const diagnostic = await readLockOwnerDiagnostic(lock);

  assert.equal(diagnostic.state, "active");
});

test("a lock owner never removes a successor lock", async () => {
  const root = await tempDir("skillloom-lock-owner-");
  await mkdir(join(root, ".skillloom"));
  const lock = join(root, ".skillloom", "lock");
  const successor = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    operationId: "op-successor",
    context: "test",
    token: "successor-token"
  };

  await assert.rejects(() => withStoreLock(root, async () => {
    await writeFile(join(lock, "lock.json"), JSON.stringify(successor));
  }, { operationId: "op-original", context: "test" }), /ownership/i);

  assert.deepEqual(JSON.parse(await readFile(join(lock, "lock.json"), "utf8")), successor);
  await rm(lock, { recursive: true });
});
