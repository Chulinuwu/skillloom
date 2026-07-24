import assert from "node:assert/strict";
import test from "node:test";
import { discoverHub, HubDiscoveryConfigurationError, HubTrustChangedError } from "../../src/hub/client/index.js";
import type { HubEndpointCache } from "../../src/hub/config/index.js";

const cached: HubEndpointCache = {
  version: 1,
  source: "service",
  serviceName: "svc:skillloom",
  url: "https://cached.tailnet.ts.net",
  verifiedAt: "2026-07-21T00:00:00.000Z"
};

test("discovers in override, cache, service, conventional host, then tailnet peer order", async () => {
  const attempts: string[] = [];
  const result = await discoverHub({
    developmentUrl: "https://dev.example.test",
    cachedEndpoint: cached,
    magicDnsSuffix: "tailnet.ts.net",
    tailnetDnsNames: ["mac-hub.tailnet.ts.net."],
    probe: async (candidate) => {
      attempts.push(candidate.url);
      return candidate.url === "https://mac-hub.tailnet.ts.net";
    }
  });
  assert.equal(result.mode, "connected");
  assert.equal(result.endpoint?.serviceName, "svc:skillloom");
  assert.deepEqual(attempts, [
    "https://dev.example.test",
    "https://cached.tailnet.ts.net",
    "https://skillloom.tailnet.ts.net",
    "https://skillloom-hub.tailnet.ts.net",
    "https://mac-hub.tailnet.ts.net"
  ]);
});
test("ignores peer names outside the current tailnet and deduplicates conventional names", async () => {
  const result = await discoverHub({
    magicDnsSuffix: "tailnet.ts.net",
    tailnetDnsNames: [
      "skillloom-hub.tailnet.ts.net.",
      "outside.example.com",
      "CLIENT.tailnet.ts.net.",
      "client.tailnet.ts.net"
    ],
    probe: async () => false
  });
  assert.deepEqual(result.attempted, [
    "https://skillloom.tailnet.ts.net",
    "https://skillloom-hub.tailnet.ts.net",
    "https://client.tailnet.ts.net"
  ]);
});
test("requires an explicit URL when multiple peer devices expose Skillloom Hubs", async () => {
  await assert.rejects(() => discoverHub({
    magicDnsSuffix: "tailnet.ts.net",
    tailnetDnsNames: ["hub-b.tailnet.ts.net", "hub-a.tailnet.ts.net"],
    probe: async (candidate) => candidate.discovery === "tailnet-peer"
  }), /Multiple Skillloom Hubs.*--hub-url/u);
});

test("returns a safe local-only degraded result when all candidates are unavailable", async () => {
  const result = await discoverHub({ magicDnsSuffix: "tailnet.ts.net", probe: async () => false });
  assert.deepEqual(result, {
    mode: "local-only",
    attempted: ["https://skillloom.tailnet.ts.net", "https://skillloom-hub.tailnet.ts.net"]
  });
});

test("rejects unsafe override URLs instead of downgrading", async () => {
  for (const url of [
    "http://hub.example.test",
    "https://user:pass@hub.example.test",
    "https://hub.example.test/path?token=x",
    "https://hub.example.test/#fragment"
  ]) {
    await assert.rejects(() => discoverHub({ developmentUrl: url, probe: async () => true }), HubDiscoveryConfigurationError);
  }
});

test("allows plain HTTP only for loopback development", async () => {
  const result = await discoverHub({ developmentUrl: "http://127.0.0.1:8787", probe: async () => true });
  assert.equal(result.endpoint?.url, "http://127.0.0.1:8787");
});

test("fails closed on trust mismatch without probing lower-precedence candidates", async () => {
  let calls = 0;
  await assert.rejects(() => discoverHub({
    cachedEndpoint: cached,
    magicDnsSuffix: "tailnet.ts.net",
    probe: async () => {
      calls += 1;
      throw new HubTrustChangedError("hubInstanceId");
    }
  }), HubTrustChangedError);
  assert.equal(calls, 1);
});
