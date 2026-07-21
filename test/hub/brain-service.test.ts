import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  BrainIdempotencyConflictError,
  BrainRevisionConflictError,
  createBrainService,
  type BrainActor,
  type BrainPermissionPort
} from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "user:owner@example.com" };

class RecordingPermissions implements BrainPermissionPort {
  readonly checks: string[] = [];

  async requireRead(input: BrainActor): Promise<void> {
    this.checks.push(`read:${input.actorId}`);
  }

  async requireWrite(input: BrainActor, action: "capture" | "update" | "link"): Promise<void> {
    this.checks.push(`${action}:${input.actorId}`);
  }
}

test("captures, reads, revision-checks, and links Markdown brain artifacts", async () => {
  const root = await tempDir("skillloom-brain-");
  const permissions = new RecordingPermissions();
  const brain = await createBrainService({ root, permissions });
  try {
    const first = await brain.capture({
      actor,
      requestId: "capture-one",
      type: "decision",
      title: "Choose durable storage",
      content: "Use Markdown as the source of truth.",
      sensitivity: "private",
      provenance: { source: "architecture-review" }
    });
    const second = await brain.capture({
      actor,
      requestId: "capture-two",
      type: "source",
      title: "SQLite notes",
      content: "FTS is a derived index.",
      sensitivity: "tailnet",
      provenance: { url: "https://sqlite.org/fts5.html" }
    });

    assert.equal(first.artifact.revision, "1");
    assert.match(first.artifact.id, /^[0-9a-f-]{36}$/);
    assert.equal(first.artifact.path, `vault/inbox/${first.artifact.id}.md`);
    assert.match(await readFile(join(root, first.artifact.path), "utf8"), /Use Markdown as the source of truth\./);
    assert.equal((await brain.read({ actor, artifactId: first.artifact.id })).content, "Use Markdown as the source of truth.");

    const updated = await brain.update({
      actor,
      requestId: "update-one",
      artifactId: first.artifact.id,
      baseRevision: "1",
      title: "Choose durable Markdown storage",
      content: "Markdown remains authoritative; SQLite can be rebuilt."
    });
    assert.equal(updated.artifact.revision, "2");
    assert.equal(updated.artifact.createdAt, first.artifact.createdAt);
    assert.equal(updated.artifact.updatedBy, actor.actorId);

    await assert.rejects(() => brain.update({
      actor,
      requestId: "stale-update",
      artifactId: first.artifact.id,
      baseRevision: "1",
      content: "This must not overwrite revision two."
    }), (error: unknown) => error instanceof BrainRevisionConflictError
      && error.baseRevision === "1"
      && error.currentRevision === "2");

    const linked = await brain.link({
      actor,
      requestId: "link-one",
      sourceArtifactId: first.artifact.id,
      targetArtifactId: second.artifact.id,
      relationship: "supported-by"
    });
    assert.equal(linked.link.relationship, "supported-by");
    assert.deepEqual(await brain.links({ actor, artifactId: first.artifact.id }), [linked.link]);
    assert.deepEqual(permissions.checks, [
      `capture:${actor.actorId}`,
      `capture:${actor.actorId}`,
      `read:${actor.actorId}`,
      `update:${actor.actorId}`,
      `update:${actor.actorId}`,
      `link:${actor.actorId}`,
      `read:${actor.actorId}`
    ]);
  } finally {
    await brain.close();
  }
});

test("replays actor-scoped request IDs and rejects payload changes", async () => {
  const root = await tempDir("skillloom-brain-idempotency-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  const input = {
    actor,
    requestId: "same-request",
    type: "note" as const,
    title: "Idempotent note",
    content: "Only one artifact is created.",
    sensitivity: "private" as const,
    provenance: { source: "agent-a" }
  };
  try {
    const original = await brain.capture(input);
    assert.deepEqual(await brain.capture(input), original);
    assert.equal(await brain.latestEventSequence(), "1");
    await assert.rejects(() => brain.capture({ ...input, content: "A different payload." }), BrainIdempotencyConflictError);
  } finally {
    await brain.close();
  }
});
