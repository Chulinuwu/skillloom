import assert from "node:assert/strict";
import test from "node:test";
import { setupCommand } from "../../src/commands/setup.js";
import type { SetupServicePort } from "../../src/setup/types.js";

test("setup command passes the parsed contract to the service", async () => {
  const requests: unknown[] = [];
  const service: SetupServicePort = {
    async setup(request) {
      requests.push(request);
      return { command: "setup", hub: { mode: "local-only" }, targets: [], reconciled: null };
    },
    async sync() {
      throw new Error("unexpected sync");
    }
  };

  await setupCommand({ command: "setup", target: "auto", hub: "auto", scope: "user", yes: true, json: true }, service);
  assert.deepEqual(requests, [{ target: "auto", hub: "auto", scope: "user", yes: true }]);
});
