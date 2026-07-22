import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createBrainService,
  createObsidianAuthoringSync,
  type BrainActor,
  type BrainArtifactType,
  type BrainPermissionPort
} from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "local:obsidian-authoring" };

class AllowingPermissions implements BrainPermissionPort {
  async requireRead(): Promise<void> {}
  async requireWrite(): Promise<void> {}
}

test("captures inbox notes, preserves evidence, and resumes idempotently", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-create-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const sync = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await sync.initialize();
    const inboxPath = join(root, "authoring", "Inbox", "idea.md");
    await writeFile(inboxPath, authoringNote({ title: "Shared idea", type: "note" }, "first body"), { mode: 0o600 });

    const result = await sync.sync();
    const created = result.items.find((item) => item.status === "captured")?.artifact?.artifact;
    assert.ok(created);
    assert.equal(created.updatedBy, actor.actorId);
    assert.equal(created.provenance.obsidianAuthoringPath, inboxPath);
    await assert.rejects(() => readFile(inboxPath, "utf8"), /ENOENT/u);

    const curatedPath = join(root, "authoring", "Curated", "note", `${created.id}.md`);
    const curated = await readFile(curatedPath, "utf8");
    assert.match(curated, /"canonicalArtifactId":"[0-9a-f-]+"/u);
    assert.match(curated, /"baseRevision":"1"/u);
    assert.match(curated, /first body/u);
    assert.equal((await readdir(join(root, "authoring", "Evidence", created.id))).length, 1);

    const restarted = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await restarted.initialize();
    const replay = await restarted.sync();
    assert.equal(replay.items.some((item) => item.status === "captured" || item.status === "updated"), false);
    assert.equal((await brain.list({ actor, type: "note" })).length, 1);
  } finally {
    await brain.close();
  }
});

test("updates curated notes and preserves stale edits as explicit conflicts", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-update-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const captured = await brain.capture({
      actor,
      requestId: "seed-authoring-note",
      type: "note",
      title: "Editable note",
      content: "revision one",
      provenance: {},
      sensitivity: "private"
    });
    const sync = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await sync.initialize();
    const path = join(root, "authoring", "Curated", "note", `${captured.artifact.id}.md`);
    await writeFile(path, (await readFile(path, "utf8")).replace("revision one", "human revision"), { mode: 0o600 });
    const updated = await sync.sync();
    assert.equal(updated.items.some((item) => item.status === "updated"), true);
    const revisionTwo = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(revisionTwo.revision, "2");
    assert.equal(revisionTwo.content, "human revision");

    await brain.update({
      actor,
      requestId: "external-update",
      artifactId: revisionTwo.id,
      baseRevision: revisionTwo.revision,
      content: "external canonical revision"
    });
    await writeFile(path, (await readFile(path, "utf8")).replace("human revision", "pending stale edit"), { mode: 0o600 });
    const conflicted = await sync.sync();
    assert.equal(conflicted.items.some((item) => item.status === "conflict"), true);
    assert.match(await readFile(path, "utf8"), /pending stale edit/u);
    assert.equal((await brain.read({ actor, artifactId: captured.artifact.id })).content, "external canonical revision");
    assert.equal((await brain.list({ actor, type: "rejected-update" })).length, 1);
    assert.equal((await readdir(join(root, "authoring", "Conflicts"))).length, 1);

    await writeFile(path, (await readFile(path, "utf8")).replace('"baseRevision":"2"', '"baseRevision":"3"'), { mode: 0o600 });
    const resolved = await sync.sync();
    assert.equal(resolved.items.some((item) => item.status === "updated"), true);
    const revisionFour = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(revisionFour.revision, "4");
    assert.equal(revisionFour.content, "pending stale edit");
  } finally {
    await brain.close();
  }
});

test("refreshes clean canonical notes without overwriting pending local edits", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-refresh-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const captured = await brain.capture({
      actor,
      requestId: "seed-refresh-note",
      type: "note",
      title: "Refreshable",
      content: "canonical one",
      provenance: {},
      sensitivity: "private"
    });
    const sync = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await sync.initialize();
    const path = join(root, "authoring", "Curated", "note", `${captured.artifact.id}.md`);
    const first = await brain.read({ actor, artifactId: captured.artifact.id });
    const second = await brain.update({
      actor,
      requestId: "clean-external-update",
      artifactId: first.id,
      baseRevision: first.revision,
      content: "canonical two"
    });
    const refreshed = await sync.sync();
    assert.equal(refreshed.items.some((item) => item.status === "refreshed"), true);
    assert.match(await readFile(path, "utf8"), /canonical two/u);
    assert.match(await readFile(path, "utf8"), new RegExp(`"baseRevision":"${second.artifact.revision}"`, "u"));

    await writeFile(path, (await readFile(path, "utf8")).replace("canonical two", "pending local change"), { mode: 0o600 });
    await brain.update({
      actor,
      requestId: "pending-external-update",
      artifactId: first.id,
      baseRevision: second.artifact.revision,
      content: "canonical three"
    });
    await sync.sync();
    assert.match(await readFile(path, "utf8"), /pending local change/u);
  } finally {
    await brain.close();
  }
});

test("quarantines direct authoring of source, workflow, skill, episode, and derived internals", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-policy-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const sync = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await sync.initialize();
    const inbox = join(root, "authoring", "Inbox");
    const blocked: readonly BrainArtifactType[] = ["source", "workflow", "skill-release", "bounded-episode", "hot-context"];
    for (const type of blocked) {
      await writeFile(join(inbox, `${type}.md`), authoringNote({ title: type, type }, "must be quarantined"), { mode: 0o600 });
    }
    await writeFile(join(inbox, "invalid-target.md"), authoringNote({
      title: "Invalid target",
      canonicalArtifactId: "not-a-uuid",
      baseRevision: "zero"
    }, "must not stop the batch"), { mode: 0o600 });
    const result = await sync.sync();
    assert.equal(result.items.filter((item) => item.status === "quarantined").length, blocked.length + 1);
    for (const type of blocked) assert.equal((await brain.list({ actor, type })).length, 0);
    assert.equal((await brain.list({ actor, type: "health-report" })).length, blocked.length + 1);
    assert.equal((await readdir(join(root, "authoring", "Conflicts"))).length, blocked.length + 1);
  } finally {
    await brain.close();
  }
});

test("defers files that may still be mid-write", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-settle-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const sync = createObsidianAuthoringSync({ root, brain, actor, settleMs: 60_000 });
    await sync.initialize();
    const path = join(root, "authoring", "Inbox", "partial.md");
    await writeFile(path, authoringNote({ title: "Partial", type: "note" }, "still being written"), { mode: 0o600 });
    const result = await sync.sync();
    assert.equal(result.items.some((item) => item.path === path && item.status === "unsettled"), true);
    assert.equal((await brain.list({ actor, type: "note" })).length, 0);
    assert.match(await readFile(path, "utf8"), /still being written/u);
  } finally {
    await brain.close();
  }
});

test("rebuilds missing or corrupt checkpoints without replaying clean Curated files", async () => {
  const root = await tempDir("skillloom-obsidian-authoring-checkpoint-recovery-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const captured = await brain.capture({
      actor,
      requestId: "checkpoint-recovery-seed",
      type: "note",
      title: "Recovery note",
      content: "canonical content",
      provenance: {},
      sensitivity: "private"
    });
    const checkpointPath = join(root, "operations", "obsidian-authoring", "checkpoints.json");
    const curatedPath = join(root, "authoring", "Curated", "note", `${captured.artifact.id}.md`);
    const initial = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await initial.initialize();

    await rm(checkpointPath);
    const missingRecovery = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await missingRecovery.initialize();
    await missingRecovery.sync();
    assert.equal((await brain.read({ actor, artifactId: captured.artifact.id })).revision, "1");
    assert.match(await readFile(checkpointPath, "utf8"), /"state": "synced"/u);

    await writeFile(checkpointPath, "{not-json", { mode: 0o600 });
    const corruptRecovery = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await corruptRecovery.initialize();
    await corruptRecovery.sync();
    assert.equal((await brain.read({ actor, artifactId: captured.artifact.id })).revision, "1");
    assert.match(await readFile(checkpointPath, "utf8"), /"state": "synced"/u);

    await writeFile(curatedPath, (await readFile(curatedPath, "utf8")).replace("canonical content", "pending local recovery"), { mode: 0o600 });
    await rm(checkpointPath);
    await brain.update({
      actor,
      requestId: "checkpoint-recovery-external",
      artifactId: captured.artifact.id,
      baseRevision: "1",
      content: "new canonical content"
    });
    const pendingRecovery = createObsidianAuthoringSync({ root, brain, actor, settleMs: 0 });
    await pendingRecovery.initialize();
    assert.match(await readFile(curatedPath, "utf8"), /pending local recovery/u);
    const result = await pendingRecovery.sync();
    assert.equal(result.items.some((item) => item.status === "conflict"), true);
    const canonical = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(canonical.revision, "2");
    assert.equal(canonical.content, "new canonical content");
    assert.match(await readFile(curatedPath, "utf8"), /pending local recovery/u);
  } finally {
    await brain.close();
  }
});

function authoringNote(frontmatter: Record<string, unknown>, content: string): string {
  return `---\n${JSON.stringify(frontmatter)}\n---\n${content}`;
}
