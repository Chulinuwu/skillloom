import assert from "node:assert/strict";
import test from "node:test";
import { resolveSetupSurfaces } from "../../src/setup/surfaces.js";
test("setup surfaces derive Obsidian from the same host Serve identity", () => {
  assert.deepEqual(resolveSetupSurfaces({
    mode: "connected",
    endpoint: "https://main-hub.example.ts.net",
    hubInstanceId: "hub-1",
    signingKeyFingerprint: "sha256:key"
  }), {
    hub: { url: "https://main-hub.example.ts.net", externalPort: 443 },
    obsidian: {
      url: "https://main-hub.example.ts.net:8443",
      externalPort: 8443,
      internalPort: 3000,
      access: "read-only"
    }
  });
  assert.equal(resolveSetupSurfaces({ mode: "local-only" }), null);
});
