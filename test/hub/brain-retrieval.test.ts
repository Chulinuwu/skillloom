import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { brainLayout } from "../../src/hub/brain/layout.js";
import { openBrainSqlite } from "../../src/hub/brain/sqlite-runtime.js";
import { createBrainService, type BrainActor, type BrainPermissionPort } from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "node:retrieval" };
const permissions: BrainPermissionPort = {
  async requireRead() {},
  async requireWrite() {}
};

test("retrieval ranks deterministically, applies typed filters, traverses graph, decorates contradictions and gaps", async () => {
  const root = await tempDir("skillloom-brain-retrieval-");
  const brain = await createBrainService({ root, permissions });
  try {
    const primary = await brain.capture({
      actor,
      requestId: randomUUID(),
      type: "fact",
      title: "Alpha retrieval foundation",
      content: "alpha retrieval durable context",
      sensitivity: "tailnet",
      provenance: {},
      details: { kind: "knowledge", status: "accepted" }
    });
    const linked = await brain.capture({
      actor,
      requestId: randomUUID(),
      type: "decision",
      title: "Linked decision",
      content: "Graph-only candidate",
      sensitivity: "tailnet",
      provenance: {}
    });
    const contradiction = await brain.capture({
      actor,
      requestId: randomUUID(),
      type: "claim",
      title: "Alpha older claim",
      content: "alpha retrieval contradicts current approach",
      sensitivity: "tailnet",
      provenance: {},
      details: { kind: "knowledge", status: "disputed" }
    });
    const gap = await brain.capture({
      actor,
      requestId: randomUUID(),
      type: "health-report",
      title: "Alpha missing verifier",
      content: "alpha retrieval needs held-out verifier",
      sensitivity: "tailnet",
      provenance: {},
      frontmatter: { gap: true }
    });
    await brain.link({ actor, requestId: randomUUID(), sourceArtifactId: primary.artifact.id, targetArtifactId: linked.artifact.id, relationship: "supported-by" });
    await brain.link({ actor, requestId: randomUUID(), sourceArtifactId: primary.artifact.id, targetArtifactId: contradiction.artifact.id, relationship: "contradicts" });
    await brain.link({ actor, requestId: randomUUID(), sourceArtifactId: primary.artifact.id, targetArtifactId: gap.artifact.id, relationship: "fills-gap" });
    const quick = await brain.retrieve({ actor, query: "alpha retrieval", tier: "quick", limit: 5 });
    assert.equal(quick.results[0]?.id, primary.artifact.id);
    assert.equal(quick.results.some((item) => item.id === linked.artifact.id), false);
    const standard = await brain.retrieve({ actor, query: "alpha retrieval", tier: "standard", limit: 5, filters: { sensitivities: ["tailnet"], hasSource: false } });
    assert.equal(standard.results.some((item) => item.id === linked.artifact.id), true);
    const decorated = standard.results.find((item) => item.id === primary.artifact.id);
    assert.equal(decorated?.decorations.contradictions[0]?.artifact.id, contradiction.artifact.id);
    assert.equal(decorated?.decorations.gaps[0]?.artifact.id, gap.artifact.id);
    const filtered = await brain.retrieve({ actor, query: "alpha retrieval", tier: "deep", filters: { statuses: ["accepted"] } });
    assert.deepEqual(filtered.results.map((item) => item.id), [primary.artifact.id]);
    assert.equal(filtered.health?.status, "ok");
    assert.equal(filtered.health.unresolvedGaps, 1);
  } finally {
    await brain.close();
  }
});

test("retrieval and health repair a stale derived index without mutating canonical records", async () => {
  const root = await tempDir("skillloom-brain-health-");
  const brain = await createBrainService({ root, permissions });
  try {
    const captured = await brain.capture({
      actor,
      requestId: randomUUID(),
      type: "fact",
      title: "Health index",
      content: "health lint keeps canonical store read-only",
      sensitivity: "private",
      provenance: {}
    });
    await deleteIndexedArtifact(root, captured.artifact.id);
    const recovered = await brain.retrieve({ actor, query: "health lint", tier: "quick" });
    await deleteIndexedArtifact(root, captured.artifact.id);
    const health = await brain.health({ actor });
    const readBack = await brain.read({ actor, artifactId: captured.artifact.id });
    assert.equal(recovered.recoveredIndex, true);
    assert.equal(recovered.results[0]?.id, captured.artifact.id);
    assert.equal(health.status, "ok");
    assert.equal(health.recoveredIndex, true);
    assert.deepEqual(health.issues, []);
    assert.equal(readBack.id, captured.artifact.id);
  } finally {
    await brain.close();
  }
});

async function deleteIndexedArtifact(root: string, artifactId: string): Promise<void> {
  const database = await openBrainSqlite(brainLayout(root).sqlite);
  try {
    database.prepare("DELETE FROM artifacts WHERE id = ?").run(artifactId);
    database.prepare("DELETE FROM artifact_fts WHERE artifact_id = ?").run(artifactId);
  } finally {
    database.close();
  }
}
