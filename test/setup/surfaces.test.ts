import assert from "node:assert/strict";
import test from "node:test";
import { resolveSetupSurfaces } from "../../src/setup/surfaces.js";

test("setup surfaces derive the separate Obsidian Tailscale service without exposing backend ports", () => {
  assert.deepEqual(resolveSetupSurfaces({
    mode: "connected",
    endpoint: "https://skillloom.example.ts.net",
    hubInstanceId: "hub-1",
    signingKeyFingerprint: "sha256:key"
  }), {
    hub: { url: "https://skillloom.example.ts.net", externalPort: 443 },
    obsidian: {
      url: "https://skillloom-obsidian.example.ts.net",
      externalPort: 443,
      internalPort: 3000,
      access: "read-only"
    }
  });
  assert.equal(resolveSetupSurfaces({ mode: "local-only" }), null);
});
