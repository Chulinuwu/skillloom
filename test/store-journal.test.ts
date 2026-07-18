import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initCommand } from "../src/commands/init.js";
import { statusCommand } from "../src/commands/status.js";
import { readEvents } from "../src/store/journal.js";
import { recoverStaleJournalLock } from "../src/store/journal-lock-recovery.js";
import { tempDir } from "./helpers/fixtures.js";

test("readEvents rejects malformed and truncated journals", async () => {
  const root = await tempDir("skillloom-journal-");
  await initCommand({ command: "init", root, json: true });
  await writeFile(join(root, ".skillloom", "events.jsonl"), "{not-json}\n");
  await assert.rejects(() => readEvents(root), /journal.*corrupt/i);
  await writeFile(join(root, ".skillloom", "events.jsonl"), '{"sequence":1');
  await assert.rejects(() => readEvents(root), /journal.*truncated/i);
});

test("status reports stale journal lock owner metadata without removing it", async () => {
  const root = await tempDir("skillloom-journal-lock-");
  await initCommand({ command: "init", root, json: true });
  const lock = join(root, ".skillloom", "journal.lock");
  await mkdir(lock);
  await writeFile(join(lock, "lock.json"), JSON.stringify({
    pid: 2147483647,
    createdAt: "2000-01-01T00:00:00.000Z",
    operationId: "op-promote-dead",
    context: "append-event"
  }));
  const status = await statusCommand({ command: "status", json: true }, root);
  assert.equal(status.journalLock.state, "stale");
  assert.equal(status.journalLock.operationId, "op-promote-dead");
  assert.equal(status.journalLock.action, "skillloom recover-lock journal --yes");
  const recovery = await recoverStaleJournalLock(root);
  await assert.rejects(() => stat(lock), { code: "ENOENT" });
  await stat(recovery.archivedPath);
});
