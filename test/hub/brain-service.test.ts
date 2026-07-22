import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  BrainIdempotencyConflictError,
  BrainRevisionConflictError,
  createBrainService,
  type BrainActor,
  type BrainPermissionPort
} from "../../src/hub/brain/index.js";
import { hashBrainContent } from "../../src/hub/brain/hash.js";
import { episodeToBrainCaptureInput } from "../../src/learning/brain-handoff.js";
import { buildLearningEpisode } from "../../src/learning/episode.js";
import type { LearningEvent } from "../../src/learning/types.js";
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

test("accepts legacy regex-valid custom relationships alongside canonical vocabulary", async () => {
  const root = await tempDir("skillloom-brain-legacy-relationship-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  try {
    const first = await brain.capture({
      actor,
      requestId: "legacy-relation-source",
      type: "note",
      title: "Legacy relationship source",
      content: "Custom relationship source.",
      sensitivity: "private",
      provenance: {}
    });
    const second = await brain.capture({
      actor,
      requestId: "legacy-relation-target",
      type: "note",
      title: "Legacy relationship target",
      content: "Custom relationship target.",
      sensitivity: "private",
      provenance: {}
    });
    const linked = await brain.link({
      actor,
      requestId: "legacy-relation-link",
      sourceArtifactId: first.artifact.id,
      targetArtifactId: second.artifact.id,
      relationship: "related-to"
    });
    assert.equal(linked.link.relationship, "related-to");
  } finally {
    await brain.close();
  }
});

test("rejects detail variants that do not match the artifact type", async () => {
  const root = await tempDir("skillloom-brain-detail-mismatch-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  try {
    await assert.rejects(() => brain.capture({
      actor,
      requestId: "bad-detail-mismatch",
      type: "bounded-episode",
      title: "Bad episode",
      content: "Workflow details are not episode details.",
      sensitivity: "private",
      provenance: {},
      details: {
        kind: "workflow",
        trigger: "wrong detail",
        steps: ["do not persist"],
        promotable: false
      }
    }), /typed brain metadata is malformed/);
  } finally {
    await brain.close();
  }
});

test("rejects explicit layers that do not match artifact type", async () => {
  const root = await tempDir("skillloom-brain-layer-mismatch-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  try {
    await assert.rejects(() => brain.capture({
      actor,
      requestId: "bad-layer-mismatch",
      type: "source",
      layer: "human-knowledge",
      title: "Bad source layer",
      content: "Source records must live in evidence layer.",
      sensitivity: "private",
      provenance: {}
    }), /typed brain metadata is malformed/);
  } finally {
    await brain.close();
  }
});

test("captures typed second-brain records and keeps source metadata immutable across updates", async () => {
  const root = await tempDir("skillloom-brain-typed-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  try {
    const captured = await brain.capture({
      actor,
      requestId: "typed-episode",
      type: "bounded-episode",
      title: "Agent completed setup",
      content: "The task finished after a retry.",
      sensitivity: "tailnet",
      provenance: { recorder: "hermes-stop-hook" },
      source: {
        sourceId: "task:setup-1",
        capturedAt: "2026-07-22T00:00:00.000Z",
        contentHash: "sha256:episode-source",
        uri: "task://setup-1",
        retrievedBy: actor.actorId
      },
      details: {
        kind: "episode",
        taskId: "setup-1",
        hostId: "codex-mac",
        startedAt: "2026-07-22T00:00:00.000Z",
        endedAt: "2026-07-22T00:10:00.000Z",
        outcome: "success"
      }
    });
    assert.equal(captured.artifact.type, "bounded-episode");
    assert.equal(captured.artifact.layer, "agent-knowledge");
    assert.equal(captured.artifact.source?.sourceId, "task:setup-1");
    assert.equal(captured.artifact.details.kind, "episode");
    assert.equal(captured.artifact.details.outcome, "success");
    const updated = await brain.update({
      actor,
      requestId: "typed-episode-update",
      artifactId: captured.artifact.id,
      baseRevision: captured.artifact.revision,
      type: "workflow",
      content: "The retry sequence is reusable.",
      details: {
        kind: "workflow",
        trigger: "setup failure with recoverable network error",
        steps: ["inspect failure", "retry idempotent step", "verify service health"],
        verifier: "healthz",
        promotable: false
      }
    });
    const read = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(updated.artifact.layer, "workflow");
    assert.equal(read.source?.sourceId, "task:setup-1");
    assert.equal(read.details.kind, "workflow");
    assert.equal(read.details.steps.length, 3);
    const detailsOnly = await brain.update({
      actor,
      requestId: "typed-workflow-details-only-update",
      artifactId: captured.artifact.id,
      baseRevision: updated.artifact.revision,
      details: {
        kind: "workflow",
        trigger: "setup failure after network drift",
        steps: ["inspect failure", "refresh docs", "retry idempotent step", "verify service health"],
        verifier: "healthz",
        promotable: true
      }
    });
    const reread = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(detailsOnly.artifact.type, "workflow");
    assert.equal(detailsOnly.artifact.layer, "workflow");
    assert.equal(reread.details.kind, "workflow");
    assert.equal(reread.details.promotable, true);
    await assert.rejects(() => brain.update({
      actor,
      requestId: "typed-workflow-bad-details-only-update",
      artifactId: captured.artifact.id,
      baseRevision: detailsOnly.artifact.revision,
      details: {
        kind: "episode",
        taskId: "wrong-kind",
        hostId: "codex-mac",
        startedAt: "2026-07-22T00:00:00.000Z",
        outcome: "success"
      }
    }), /typed brain metadata is malformed/);
  } finally {
    await brain.close();
  }
});

test("captures learning episode handoff through the real Brain service", async () => {
  const root = await tempDir("skillloom-brain-learning-handoff-");
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  const event: LearningEvent = {
    eventId: "learn-brain-handoff",
    createdAt: "2026-07-22T00:00:00.000Z",
    source: "codex",
    outcome: "memory",
    summary: "Bounded learning handoff",
    episode: buildLearningEpisode({
      taskId: "handoff-task",
      host: "codex",
      outcome: "success",
      startedAt: "2026-07-22T00:00:00.000Z",
      endedAt: "2026-07-22T00:01:00.000Z",
      evidence: [{ category: "test", summary: "targeted test passed" }],
      verifierSignals: [{ kind: "test", status: "passed", summary: "node test passed" }]
    })
  };
  try {
    const captured = await brain.capture(episodeToBrainCaptureInput(event));
    assert.equal(captured.artifact.type, "bounded-episode");
    assert.equal(captured.artifact.layer, "agent-knowledge");
    assert.equal(captured.artifact.details.kind, "episode");
    assert.equal(captured.artifact.details.taskId, "handoff-task");
  } finally {
    await brain.close();
  }
});

test("loads legacy brain markdown without new typed metadata", async () => {
  const root = await tempDir("skillloom-brain-legacy-");
  const artifactId = "11111111-1111-1111-1111-111111111111";
  const content = "Old note body.";
  await mkdir(join(root, "vault/inbox"), { recursive: true });
  await writeFile(join(root, "vault/inbox", `${artifactId}.md`), `---
${JSON.stringify({
    id: artifactId,
    type: "note",
    path: `vault/inbox/${artifactId}.md`,
    revision: "1",
    contentHash: hashBrainContent(content),
    title: "Legacy note",
    frontmatter: {},
    provenance: {},
    sensitivity: "private",
    createdAt: "2026-07-22T00:00:00.000Z",
    createdBy: actor.actorId,
    updatedAt: "2026-07-22T00:00:00.000Z",
    updatedBy: actor.actorId
  })}
---
${content}`);
  const brain = await createBrainService({ root, permissions: new RecordingPermissions() });
  try {
    const read = await brain.read({ actor, artifactId });
    assert.equal(read.layer, "human-knowledge");
    assert.deepEqual(read.details, { kind: "none" });
  } finally {
    await brain.close();
  }
});
