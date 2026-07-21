import assert from "node:assert/strict";
import test from "node:test";
import { syncCommand } from "../../src/commands/sync.js";
import type { SetupServicePort } from "../../src/setup/types.js";

test("sync command preserves apply mode", async () => {
  const modes: boolean[] = [];
  const service: SetupServicePort = {
    async setup() {
      throw new Error("unexpected setup");
    },
    async sync(apply) {
      modes.push(apply);
      return { command: "sync", applied: apply, pulled: 0, imported: 0, conflicts: [] };
    }
  };

  await syncCommand({ command: "sync", apply: false, json: false }, service);
  await syncCommand({ command: "sync", apply: true, json: true }, service);
  assert.deepEqual(modes, [false, true]);
});
