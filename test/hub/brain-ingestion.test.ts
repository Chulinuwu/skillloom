import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  BrainImmutableSourceError,
  BrainSourceSensitivityMismatchError,
  createBrainService,
  FileObsidianProjectionManager,
  importHumanInbox,
  ingestImmutableSource,
  rebuildObsidianProjection,
  stageHumanInboxNote,
  type BrainActor,
  type BrainDerivedProjectionPort,
  type BrainPermissionPort
} from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "user:owner@example.com" };
const secondActor: BrainActor = { actorId: "user:second@example.com" };

class AllowingPermissions implements BrainPermissionPort {
  async requireRead(): Promise<void> {}
  async requireWrite(): Promise<void> {}
}
class FailingProjection implements BrainDerivedProjectionPort {
  dirty = false;
  initialized = false;
  async initialize(): Promise<void> {
    this.initialized = true;
  }
  async markDirty(): Promise<void> {
    this.dirty = true;
  }
  async refresh(): Promise<void> {
    throw new Error("projection refresh failed");
  }
}

test("ingests immutable sources with extracted links, contradictions, and gap records", async () => {
  const root = await tempDir("skillloom-brain-source-ingest-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const existing = await brain.capture({
      actor,
      requestId: "existing-claim",
      type: "claim",
      title: "Old claim",
      content: "The hub should be writable from Obsidian projections.",
      provenance: {},
      sensitivity: "private",
      details: { kind: "knowledge", status: "accepted" }
    });
    const result = await ingestImmutableSource(brain, {
      actor,
      requestId: "source-import",
      title: "Architecture note",
      content: "Canonical writes go through the authenticated Brain API.",
      capturedAt: "2026-07-22T00:00:00.000Z",
      uri: "https://example.test/architecture",
      mediaType: "text/markdown",
      fetchedAt: "2026-07-22T00:00:00.000Z",
      retrievedBy: actor.actorId,
      provenance: { importer: "test" },
      sensitivity: "tailnet",
      extractions: [{
        requestId: "claim-one",
        type: "claim",
        title: "Authenticated writes only",
        content: "Agents and humans write through BrainService/API, not projection files.",
        confidence: 0.9,
        concepts: ["canonical-write"],
        contradicts: [existing.artifact.id]
      }],
      gaps: [{
        requestId: "gap-one",
        title: "Missing watcher policy",
        question: "How should writable Obsidian inbox files be quarantined?"
      }]
    });
    assert.equal(result.source.artifact.type, "source");
    assert.equal(result.source.artifact.frontmatter.immutable, true);
    assert.equal(result.extracted.length, 1);
    assert.equal(result.gaps.length, 1);
    assert.equal(result.gaps[0]?.artifact.type, "health-report");
    assert.equal(result.links.some((link) => link.link.relationship === "contradicts"), true);
    assert.deepEqual(await ingestImmutableSource(brain, {
      actor,
      requestId: "source-import",
      title: "Architecture note",
      content: "Canonical writes go through the authenticated Brain API.",
      capturedAt: "2026-07-22T00:00:00.000Z",
      uri: "https://example.test/architecture",
      mediaType: "text/markdown",
      fetchedAt: "2026-07-22T00:00:00.000Z",
      retrievedBy: actor.actorId,
      provenance: { importer: "test" },
      sensitivity: "tailnet"
    }).then((replay) => replay.source), result.source);
  } finally {
    await brain.close();
  }
});

test("deduplicates immutable sources by content hash and rejects source mutation paths", async () => {
  const root = await tempDir("skillloom-brain-source-boundary-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const first = await brain.capture({
      actor,
      requestId: "source-direct-one",
      type: "source",
      title: "Original source",
      content: "Same source body.",
      provenance: { importer: "first" },
      sensitivity: "tailnet"
    });
    const [second, third] = await Promise.all([
      brain.capture({
        actor: secondActor,
        requestId: "source-direct-two",
        type: "source",
        title: "Duplicate source",
        content: "Same source body.",
        provenance: { importer: "second" },
        sensitivity: "tailnet"
      }),
      brain.capture({
        actor,
        requestId: "source-direct-three",
        type: "source",
        title: "Duplicate source again",
        content: "Same source body.",
        provenance: { importer: "third" },
        sensitivity: "tailnet"
      })
    ]);
    assert.equal(second.artifact.id, first.artifact.id);
    assert.equal(third.artifact.id, first.artifact.id);
    assert.equal((await brain.list({ actor, type: "source" })).length, 1);
    assert.equal(await brain.latestEventSequence(), "3");
    await assert.rejects(() => brain.capture({
      actor,
      requestId: "source-direct-private-duplicate",
      type: "source",
      title: "Less shared source",
      content: "Same source body.",
      provenance: {},
      sensitivity: "private"
    }), BrainSourceSensitivityMismatchError);
    await assert.rejects(() => brain.update({
      actor,
      requestId: "mutate-source-content",
      artifactId: first.artifact.id,
      baseRevision: first.artifact.revision,
      content: "mutated"
    }), BrainImmutableSourceError);
    const note = await brain.capture({
      actor,
      requestId: "note-to-source",
      type: "note",
      title: "Note",
      content: "not a source",
      provenance: {},
      sensitivity: "private"
    });
    await assert.rejects(() => brain.update({
      actor,
      requestId: "change-note-to-source",
      artifactId: note.artifact.id,
      baseRevision: note.artifact.revision,
      type: "source"
    }), BrainImmutableSourceError);
  } finally {
    await brain.close();
  }
});

test("records distinct source observations for duplicate source bytes and origins", async () => {
  const root = await tempDir("skillloom-source-observations-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const first = await ingestImmutableSource(brain, {
      actor,
      requestId: "source-origin-a",
      title: "Origin A",
      content: "Same bytes from two places.",
      capturedAt: "2026-07-22T00:00:00.000Z",
      uri: "https://a.example/source",
      fetchedAt: "2026-07-22T00:00:00.000Z",
      provenance: { importer: "a" },
      sensitivity: "tailnet"
    });
    const second = await ingestImmutableSource(brain, {
      actor: secondActor,
      requestId: "source-origin-b",
      title: "Origin B",
      content: "Same bytes from two places.",
      capturedAt: "2026-07-22T00:01:00.000Z",
      uri: "https://b.example/source",
      fetchedAt: "2026-07-22T00:01:00.000Z",
      provenance: { importer: "b" },
      sensitivity: "tailnet"
    });
    assert.equal(second.source.artifact.id, first.source.artifact.id);
    const observations = await brain.list({ actor, type: "source-observation" });
    assert.equal(observations.length, 2);
    assert.equal(observations.some((item) => item.source?.uri === "https://a.example/source"), true);
    assert.equal(observations.some((item) => item.source?.uri === "https://b.example/source"), true);
    const observation = observations[0];
    assert.ok(observation);
    await assert.rejects(() => brain.update({
      actor,
      requestId: "mutate-source-observation",
      artifactId: observation.id,
      baseRevision: observation.revision,
      content: "mutated observation"
    }), BrainImmutableSourceError);
  } finally {
    await brain.close();
  }
});

test("rejects malformed source timestamps before capture", async () => {
  const root = await tempDir("skillloom-source-timestamp-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    await assert.rejects(() => ingestImmutableSource(brain, {
      actor,
      requestId: "bad-source-time",
      title: "Bad timestamp",
      content: "timestamp must be ISO",
      capturedAt: "not-a-date",
      fetchedAt: "not-a-date",
      provenance: {},
      sensitivity: "private"
    }), /source timestamp/u);
    await assert.rejects(() => ingestImmutableSource(brain, {
      actor,
      requestId: "missing-source-time",
      title: "Missing timestamp",
      content: "timestamp is required",
      provenance: {},
      sensitivity: "private"
    } as Parameters<typeof ingestImmutableSource>[1]), /source timestamp/u);
  } finally {
    await brain.close();
  }
});

test("projection manager retries dirty projection and never fails committed mutations on refresh failure", async () => {
  const root = await tempDir("skillloom-projection-manager-");
  const failing = new FailingProjection();
  const brain = await createBrainService({ root, permissions: new AllowingPermissions(), projection: failing });
  let artifactId = "";
  try {
    const captured = await brain.capture({
      actor,
      requestId: "projection-failing-capture",
      type: "note",
      title: "Committed despite projection failure",
      content: "The canonical mutation must succeed.",
      provenance: {},
      sensitivity: "private"
    });
    artifactId = captured.artifact.id;
    assert.equal(captured.artifact.title, "Committed despite projection failure");
    assert.equal(failing.initialized, true);
    assert.equal(failing.dirty, true);
  } finally {
    await brain.close();
  }
  const rebuilt = await createBrainService({
    root,
    permissions: new AllowingPermissions(),
    projection: new FileObsidianProjectionManager(root)
  });
  try {
    const projected = await readFile(join(root, "projections", "obsidian-vault", "Library", "human-knowledge", "note", `${artifactId}.md`), "utf8");
    assert.match(projected, /Committed despite projection failure/u);
  } finally {
    await rebuilt.close();
  }
});

test("imports human inbox files idempotently and records stale revision conflicts", async () => {
  const root = await tempDir("skillloom-human-inbox-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    await stageHumanInboxNote(root, {
      slug: "manual-note",
      title: "Manual note",
      content: "This came from a human writable staging inbox.",
      provenance: { source: "obsidian-inbox" },
      sensitivity: "private"
    });
    const first = await importHumanInbox(root, brain, actor);
    const second = await importHumanInbox(root, brain, actor);
    assert.equal(first.length, 1);
    assert.equal(first[0]?.imported, true);
    assert.equal(first[0]?.artifact?.artifact.title, "Manual note");
    assert.equal(second[0]?.imported, false);
    const captured = await brain.capture({
      actor,
      requestId: "target-for-conflict",
      type: "note",
      title: "Target",
      content: "revision one",
      provenance: {},
      sensitivity: "private"
    });
    await brain.update({
      actor,
      requestId: "target-update",
      artifactId: captured.artifact.id,
      baseRevision: captured.artifact.revision,
      content: "revision two"
    });
    await stageHumanInboxNote(root, {
      slug: "stale-update",
      title: "Target patch",
      content: "stale human edit",
      targetArtifactId: captured.artifact.id,
      baseRevision: captured.artifact.revision,
      provenance: { source: "obsidian-inbox" },
      sensitivity: "private"
    });
    const conflicts = await importHumanInbox(root, brain, actor);
    const conflict = conflicts.find((item) => item.conflict);
    assert.equal(conflict?.conflict?.artifact.type, "rejected-update");
    assert.equal(conflict?.conflict?.artifact.frontmatter.conflict, true);
    assert.match(String(conflict?.conflict?.artifact.details.kind === "rejected-update" ? conflict.conflict.artifact.details.rejectedAt : ""), /^\d{4}-\d{2}-\d{2}T/u);
    await writeFile(join(root, "operations", "human-inbox", "same-a.md"), "same staged content", { mode: 0o600 });
    await writeFile(join(root, "operations", "human-inbox", "same-b.md"), "same staged content", { mode: 0o600 });
    const sameContent = await importHumanInbox(root, brain, actor);
    assert.equal(sameContent.filter((item) => item.imported && item.artifact?.artifact.contentHash).length, 2);
    await writeFile(join(root, "operations", "human-inbox", "bad-frontmatter.md"), "---\n{\"title\":9,\"type\":\"source\",\"sensitivity\":false,\"frontmatter\":{\"ok\":true}}\n---\nmalformed metadata ignored", { mode: 0o600 });
    const malformed = await importHumanInbox(root, brain, actor);
    const quarantined = malformed.find((item) => item.path.endsWith("bad-frontmatter.md"))?.conflict?.artifact;
    assert.equal(quarantined?.type, "health-report");
    assert.equal(quarantined?.frontmatter.quarantine, true);
    await writeFile(join(root, "operations", "human-inbox", "half-update.md"), "---\n{\"title\":\"half\",\"targetArtifactId\":\"11111111-1111-1111-1111-111111111111\"}\n---\nhalf update", { mode: 0o600 });
    const half = await importHumanInbox(root, brain, actor);
    assert.equal(half.find((item) => item.path.endsWith("half-update.md"))?.conflict?.artifact.type, "health-report");
  } finally {
    await brain.close();
  }
});

test("rebuilds read-only Obsidian projection outside canonical writable vault", async () => {
  const root = await tempDir("skillloom-obsidian-projection-");
  const brain = await createBrainService({ root, permissions: new AllowingPermissions() });
  try {
    const captured = await brain.capture({
      actor,
      requestId: "projection-note",
      type: "note",
      title: "Projected note",
      content: "This projection is rebuildable.",
      provenance: {},
      sensitivity: "tailnet"
    });
    const result = await rebuildObsidianProjection(root, brain, actor);
    assert.equal(result.root, join(root, "projections", "obsidian-vault", "Library"));
    const projectedPath = join(result.root, "human-knowledge", "note", `${captured.artifact.id}.md`);
    const projected = await readFile(projectedPath, "utf8");
    const basePath = join(root, "obsidian-ui", "Bases", "Knowledge.base");
    const base = await readFile(basePath, "utf8");
    assert.equal(result.artifactCount, 1);
    assert.match(projected, /"skillloomProjection":true/);
    assert.match(projected, /"readOnly":true/);
    assert.match(base, /^filters:\n  and:\n    - 'skillloomProjection == true'/u);
    assert.match(base, /properties:\n  title:\n    displayName: Title/u);
    assert.match(base, /views:\n  - type: table/u);
    assert.equal(projectedPath.includes("vault/inbox"), false);
    assert.equal(projectedPath.includes("vault/curated"), false);
    await writeFile(basePath, "views:\n  - type: table\n    name: Custom view\n");
    const staging = join(root, "projections", "obsidian-staging");
    await mkdir(join(staging, "next"), { recursive: true });
    await writeFile(join(staging, "next", "crash-marker.md"), "complete next projection", { mode: 0o444 });
    await rename(result.root, join(staging, "previous"));
    const rebuilt = await rebuildObsidianProjection(root, brain, actor);
    assert.equal(rebuilt.artifactCount, 1);
    assert.match(await readFile(projectedPath, "utf8"), /Projected note/u);
    assert.match(await readFile(basePath, "utf8"), /Custom view/u);
  } finally {
    await brain.close();
  }
});
