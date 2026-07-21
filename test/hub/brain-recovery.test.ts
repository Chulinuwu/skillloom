import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrainService,
  type BrainActor,
  type BrainFaultPoint,
  type BrainPermissionPort
} from "../../src/hub/brain/index.js";
import { tempDir } from "../helpers/fixtures.js";

const actor: BrainActor = { actorId: "node:writer" };
const permissions: BrainPermissionPort = {
  async requireRead() {},
  async requireWrite() {}
};

for (const point of ["beforeRename", "afterRename", "afterAudit", "afterIndexCommit"] satisfies BrainFaultPoint[]) {
  test(`recovers an interrupted capture at ${point}`, async () => {
    const root = await tempDir(`skillloom-brain-${point}-`);
    let failed = false;
    const interrupted = await createBrainService({
      root,
      permissions,
      faultInjector(current) {
        if (!failed && current === point) {
          failed = true;
          throw new Error(`fault:${point}`);
        }
      }
    });
    const input = {
      actor,
      requestId: `recover-${point}`,
      type: "memory" as const,
      title: `Recovery at ${point}`,
      content: "The durable operation must roll forward exactly once.",
      sensitivity: "private" as const,
      provenance: { test: point }
    };
    await assert.rejects(() => interrupted.capture(input), new RegExp(`fault:${point}`));
    await interrupted.close();

    const recovered = await createBrainService({ root, permissions });
    try {
      const replay = await recovered.capture(input);
      assert.equal(replay.artifact.title, `Recovery at ${point}`);
      assert.equal(replay.artifact.revision, "1");
      assert.equal(await recovered.latestEventSequence(), "1");
      assert.equal((await recovered.search({ actor, query: "durable operation" })).length, 1);
    } finally {
      await recovered.close();
    }
  });
}
