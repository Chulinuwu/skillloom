import assert from "node:assert/strict";
import test from "node:test";
import { createBrainService, type BrainActor, type BrainPermissionPort } from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "node:researcher" };
const permissions: BrainPermissionPort = {
  async requireRead() {},
  async requireWrite() {}
};

test("searches title, content, type, and provenance through bounded FTS", async () => {
  const root = await tempDir("skillloom-brain-search-");
  const brain = await createBrainService({ root, permissions });
  try {
    await brain.capture({
      actor,
      requestId: "search-title",
      type: "decision",
      title: "Tailscale service discovery",
      content: "Use the stable service name.",
      sensitivity: "tailnet",
      provenance: { source: "network-design" }
    });
    await brain.capture({
      actor,
      requestId: "search-content",
      type: "fact",
      title: "Index behavior",
      content: "Obsidian markdown remains canonical.",
      sensitivity: "private",
      provenance: { source: "storage-review" }
    });
    await brain.capture({
      actor,
      requestId: "search-provenance",
      type: "source",
      title: "Reference",
      content: "External documentation.",
      sensitivity: "tailnet",
      provenance: { source: "sqlite-handbook" }
    });

    assert.equal((await brain.search({ actor, query: "Tailscale" }))[0]?.title, "Tailscale service discovery");
    assert.equal((await brain.search({ actor, query: "canonical" }))[0]?.type, "fact");
    assert.equal((await brain.search({ actor, query: "sqlite-handbook" }))[0]?.type, "source");
    assert.deepEqual(await brain.search({ actor, query: "canonical", type: "decision" }), []);

    for (let index = 0; index < 52; index += 1) {
      await brain.capture({
        actor,
        requestId: `bounded-${index}`,
        type: "note",
        title: `Bounded result ${index}`,
        content: "bounded-search-marker",
        sensitivity: "private",
        provenance: {}
      });
    }
    assert.equal((await brain.search({ actor, query: "bounded-search-marker", limit: 500 })).length, 50);
  } finally {
    await brain.close();
  }
});
