import assert from "node:assert/strict";
import test from "node:test";

import type { BrainApi } from "../../src/hub/client/index.js";
import { BrainApiBridgeAdapter } from "../../src/setup/bridge-remote.js";

test("brain bridge adapter dispatches search, retrieve, and health with MCP-compliant structured content", async () => {
  const calls: unknown[] = [];
  const api: BrainApi = {
    search: async (input) => {
      calls.push({ method: "search", input });
      return [{ artifactId: "artifact-1" }] as never;
    },
    retrieve: async (input) => {
      calls.push({ method: "retrieve", input });
      return { hot: true } as never;
    },
    health: async () => {
      calls.push({ method: "health" });
      return { ok: true } as never;
    },
    read: async () => unused(),
    capture: async () => unused(),
    update: async () => unused(),
    link: async () => unused()
  };
  const adapter = new BrainApiBridgeAdapter(api);
  const search = await adapter.call({
    name: "brain_search",
    arguments: { query: "portable skill memory", limit: 5 }
  });
  const retrieve = await adapter.call({
    name: "brain_retrieve",
    arguments: { query: "portable skill memory", tier: "standard", filters: { hasSource: true } }
  });
  const health = await adapter.call({ name: "brain_health", arguments: {} });

  assert.deepEqual(search.structuredContent, { results: [{ artifactId: "artifact-1" }] });
  assert.deepEqual(retrieve.structuredContent, { hot: true });
  assert.deepEqual(health.structuredContent, { ok: true });
  assert.deepEqual(calls, [
    { method: "search", input: { query: "portable skill memory", limit: 5 } },
    { method: "retrieve", input: { query: "portable skill memory", tier: "standard", filters: { hasSource: true } } },
    { method: "health" }
  ]);
});

function unused(): never {
  throw new Error("Unexpected Brain API call");
}
