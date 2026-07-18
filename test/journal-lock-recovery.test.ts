import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { claudeCodeAdapter } from "../src/adapters/claude-code.js";
import { captureCommand } from "../src/commands/capture.js";
import { initCommand } from "../src/commands/init.js";
import { recoverLockCommand } from "../src/commands/recover-lock.js";
import { statusCommand } from "../src/commands/status.js";
import { hashSkillDirectory } from "../src/promotions/files.js";
import { resumePromotion } from "../src/promotions/resume.js";
import { readEvents } from "../src/store/journal.js";
import { listOperations } from "../src/store/operations.js";
import { createSkillFixture, tempDir } from "./helpers/fixtures.js";

type LockOwner = {
  pid: number;
  createdAt: string;
  operationId: string;
  context: string;
};

test("a matching stale journal lock is archived with evidence before subprocess recovery resumes", async () => {
  const context = await setupInterruptedPromotion();
  await crashWhileHoldingJournalLock(context.projectRoot, context.operationId);
  const lock = journalLockPath(context.projectRoot);
  const owner = await readOwner(lock);

  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.journalLock.state, "stale");
  assert.equal(status.journalLock.action, `skillloom resume ${context.operationId} --yes`);
  assert.equal(status.recovery[0]?.recoveryCommand, `skillloom resume ${context.operationId} --yes`);

  const promotion = await resumePromotion(context.projectRoot, context.operationId, true);
  assert.equal(promotion.result, "applied");
  assert.equal(await hashSkillDirectory(context.destination), context.packageHash);
  await assert.rejects(() => stat(lock), { code: "ENOENT" });

  const archiveRoot = join(context.projectRoot, ".skillloom", "stale-locks", "journal");
  const archiveNames = await readdir(archiveRoot);
  assert.equal(archiveNames.length, 1);
  const archivedPath = join(archiveRoot, archiveNames[0]);
  assert.deepEqual(await readOwner(archivedPath), owner);

  const corrective = (await readEvents(context.projectRoot)).find((event) =>
    event.operationId === context.operationId && event.kind === "recovery" && event.phase === "lock-archived"
  );
  assert.ok(corrective);
  assert.deepEqual(corrective.evidence, { archivedPath, owner: { state: "stale", path: lock, ...owner, action: ownerAction } });
});

test("mismatched stale journal owner blocks resume unchanged but explicit recovery archives it safely", async () => {
  const context = await setupInterruptedPromotion();
  const owner = staleOwner("op-promote-other");
  const lock = await writeJournalLock(context.projectRoot, owner);
  const original = await readFile(join(lock, "lock.json"), "utf8");

  const status = await statusCommand({ command: "status", json: true }, context.projectRoot);
  assert.equal(status.recovery[0]?.recoveryCommand, null);
  assert.equal(status.journalLock.state, "stale");
  assert.equal(status.journalLock.action, "skillloom recover-lock journal --yes");
  await assert.rejects(() => resumePromotion(context.projectRoot, context.operationId, true), /belongs to op-promote-other/i);
  assert.equal(await readFile(join(lock, "lock.json"), "utf8"), original);

  const recovery = await recoverLockCommand({ command: "recover-lock", lock: "journal", yes: true, json: true }, context.projectRoot);
  assert.deepEqual(await readOwner(recovery.archivedPath), owner);
  await assert.rejects(() => stat(lock), { code: "ENOENT" });
  const corrective = (await readEvents(context.projectRoot)).at(-1);
  assert.equal(corrective?.operationId, owner.operationId);
  assert.equal(corrective?.kind, "recovery");
  assert.equal(corrective?.phase, "lock-archived");
  assert.deepEqual(corrective?.evidence, recovery);
});

test("a live PID journal lock refuses recovery and remains untouched", async () => {
  const root = await initializedRoot("skillloom-journal-live-");
  const owner: LockOwner = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    operationId: "op-live",
    context: "append-event"
  };
  const lock = await writeJournalLock(root, owner);

  await assert.rejects(
    () => recoverLockCommand({ command: "recover-lock", lock: "journal", yes: true, json: true }, root),
    /journal lock is active, not stale/i
  );
  assert.deepEqual(await readOwner(lock), owner);
  const status = await statusCommand({ command: "status", json: true }, root);
  assert.equal(status.journalLock.state, "active");
  assert.equal(status.journalLock.action, "Wait for the active operation to finish");
});

test("journal corruption blocks stale lock recovery and preserves the lock", async (testContext) => {
  const cases = [
    { name: "malformed", content: "{not-json}\n", health: "malformed" },
    { name: "truncated", content: '{"sequence":1', health: "truncated" },
    {
      name: "sequence",
      content: `${JSON.stringify({
        sequence: 2,
        timestamp: "2026-07-17T00:00:00.000Z",
        operationId: "op-sequence",
        kind: "status",
        phase: "started"
      })}\n`,
      health: "sequence"
    }
  ] as const;

  for (const item of cases) {
    await testContext.test(item.name, async () => {
      const root = await initializedRoot(`skillloom-journal-${item.name}-`);
      await writeFile(join(root, ".skillloom", "events.jsonl"), item.content);
      const owner = staleOwner(`op-${item.name}`);
      const lock = await writeJournalLock(root, owner);

      const status = await statusCommand({ command: "status", json: true }, root);
      assert.equal(status.journal.state, item.health);
      assert.equal(status.journalLock.state, "stale");
      assert.equal(status.journalLock.action, `Blocked until journal is healthy: ${item.health}`);
      await assert.rejects(
        () => recoverLockCommand({ command: "recover-lock", lock: "journal", yes: true, json: true }, root),
        new RegExp(`healthy journal: ${item.health}`, "i")
      );
      assert.deepEqual(await readOwner(lock), owner);
    });
  }
});

test("journal lock archives are create-once when timestamp paths collide", async () => {
  const root = await initializedRoot("skillloom-journal-collision-");
  const lock = await writeJournalLock(root, staleOwner("op-collision"));
  const owner = await readOwner(lock);
  const archiveRoot = join(root, ".skillloom", "stale-locks", "journal");
  const fixedNow = Date.parse("2040-01-01T00:00:00.000Z");
  const priorPath = join(archiveRoot, `op-collision-${fixedNow}`);
  const priorOwner = staleOwner("op-prior");
  await mkdir(priorPath, { recursive: true });
  await writeFile(join(priorPath, "lock.json"), JSON.stringify(priorOwner));

  const originalNow = Date.now;
  Date.now = () => fixedNow;
  let recovery: Awaited<ReturnType<typeof recoverLockCommand>>;
  try {
    recovery = await recoverLockCommand({ command: "recover-lock", lock: "journal", yes: true, json: true }, root);
  } finally {
    Date.now = originalNow;
  }

  assert.equal(recovery.archivedPath, `${priorPath}-1`);
  assert.deepEqual(await readOwner(priorPath), priorOwner);
  assert.deepEqual(await readOwner(recovery.archivedPath), owner);
  const corrective = (await readEvents(root)).at(-1);
  assert.deepEqual(corrective?.evidence, recovery);
});

const ownerAction = "Inspect stale lock metadata and use the operation recovery command reported by status";

async function setupInterruptedPromotion() {
  const projectRoot = await initializedRoot("skillloom-journal-crash-");
  const homeDir = await tempDir("skillloom-journal-crash-home-");
  const source = await createSkillFixture();
  const candidate = await captureCommand({ command: "capture", source, createdBy: "agent", evidence: [], json: true }, projectRoot);
  await crashPromotion(projectRoot, homeDir, candidate.candidateId);
  const operation = (await listOperations(projectRoot)).find((item) => item.kind === "promote" && item.status !== "completed");
  assert.ok(operation);
  return {
    projectRoot,
    operationId: operation.operationId,
    destination: claudeCodeAdapter.resolveDestination({ projectRoot, homeDir }, "project", candidate.metadata.name),
    packageHash: candidate.packageHash
  };
}

async function initializedRoot(prefix: string): Promise<string> {
  const root = await tempDir(prefix);
  await initCommand({ command: "init", root, json: true });
  return root;
}

async function crashPromotion(root: string, homeDir: string, candidateId: string): Promise<void> {
  const worker = join(import.meta.dirname, "helpers", "crash-worker.ts");
  await assertKilled(spawn(process.execPath, [
    "--import", "tsx", worker, "promote", root, homeDir, candidateId, "promotion:0:displace-intent-checkpoint"
  ], { stdio: "ignore" }));
}

async function crashWhileHoldingJournalLock(root: string, operationId: string): Promise<void> {
  const worker = join(import.meta.dirname, "helpers", "journal-lock-crash-worker.ts");
  await assertKilled(spawn(process.execPath, ["--import", "tsx", worker, root, operationId], { stdio: "ignore" }));
}

async function assertKilled(child: ReturnType<typeof spawn>): Promise<void> {
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(result.signal, "SIGKILL");
}

async function writeJournalLock(root: string, owner: LockOwner): Promise<string> {
  const lock = journalLockPath(root);
  await mkdir(lock);
  await writeFile(join(lock, "lock.json"), JSON.stringify(owner));
  return lock;
}

async function readOwner(lock: string): Promise<LockOwner> {
  return JSON.parse(await readFile(join(lock, "lock.json"), "utf8"));
}

function journalLockPath(root: string): string {
  return join(root, ".skillloom", "journal.lock");
}

function staleOwner(operationId: string): LockOwner {
  return { pid: 2147483647, createdAt: "2000-01-01T00:00:00.000Z", operationId, context: "append-event" };
}
