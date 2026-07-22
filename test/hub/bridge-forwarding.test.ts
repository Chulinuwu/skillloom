import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  createBridgeServer,
  type BridgeRemoteBrainCall,
  type BridgeRemoteBrainPort,
  type BridgeRemoteToolCall,
  type BridgeToolResult
} from "../../src/bridge/index.js";

test("lists brain and registry tools", async () => {
  const server = createBridgeServer({ remote: { call: async () => success({}) } });
  const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = (response?.result as { tools: Array<{ name: string }> }).tools;
  assert.deepEqual(tools.map((tool) => tool.name), [
    "brain_search",
    "brain_retrieve",
    "brain_health",
    "brain_read",
    "brain_capture",
    "brain_update",
    "brain_link",
    "skill_releases",
    "skill_read",
    "skill_propose",
    "skill_publish"
  ]);
});

test("accepts every advertised bridge tool name through tools/call", async () => {
  const calls: BridgeRemoteToolCall[] = [];
  const server = createBridgeServer({ remote: { call: async (call) => { calls.push(call); return success({ ok: true }); } } });
  const listed = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = (listed?.result as { tools: Array<{ name: string }> }).tools;

  for (const tool of tools) {
    const response = await server.handle({ jsonrpc: "2.0", id: tool.name, method: "tools/call", params: { name: tool.name, arguments: {} } });
    assert.equal(response?.error, undefined);
  }

  assert.deepEqual(calls.map((call) => call.name), tools.map((tool) => tool.name));
});

test("forwards tool name and arguments unchanged with mutation request ID", async () => {
  const calls: BridgeRemoteBrainCall[] = [];
  const expected = success({ artifact: { id: randomUUID(), revision: "1" } });
  const remote: BridgeRemoteBrainPort = { call: async (call) => { calls.push(call); return expected; } };
  const server = createBridgeServer({ remote });
  const requestId = randomUUID();
  const args = {
    requestId,
    type: "note",
    title: "Across devices",
    content: "same brain",
    provenance: { source: "bridge-test" },
    sensitivity: "tailnet"
  };

  const response = await server.handle({
    jsonrpc: "2.0",
    id: "rpc-7",
    method: "tools/call",
    params: { name: "brain_capture", arguments: args }
  });

  assert.deepEqual(calls, [{ name: "brain_capture", arguments: args, requestId }]);
  assert.deepEqual(response, { jsonrpc: "2.0", id: "rpc-7", result: expected });
});

test("read calls omit mutation request ID and preserve remote structured errors", async () => {
  const calls: BridgeRemoteBrainCall[] = [];
  const denied: BridgeToolResult = {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code: "HUB_FORBIDDEN", message: "denied" } }) }],
    structuredContent: { error: { code: "HUB_FORBIDDEN", message: "denied" } }
  };
  const server = createBridgeServer({ remote: { call: async (call) => { calls.push(call); return denied; } } });
  const args = { artifactId: randomUUID() };
  const response = await server.handle({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "brain_read", arguments: args }
  });

  assert.deepEqual(calls, [{ name: "brain_read", arguments: args }]);
  assert.equal((response?.result as BridgeToolResult).isError, true);
  assert.deepEqual((response?.result as BridgeToolResult).structuredContent, denied.structuredContent);
});

test("forwards retrieve and health tools advertised by MCP", async () => {
  const calls: BridgeRemoteBrainCall[] = [];
  const server = createBridgeServer({ remote: { call: async (call) => { calls.push(call); return success({ ok: true }); } } });
  const retrieveArgs = { query: "portable skill memory", tier: "standard", filters: { hasSource: true } };

  await server.handle({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "brain_retrieve", arguments: retrieveArgs }
  });
  await server.handle({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: { name: "brain_health", arguments: {} }
  });

  assert.deepEqual(calls, [
    { name: "brain_retrieve", arguments: retrieveArgs },
    { name: "brain_health", arguments: {} }
  ]);
});

test("forwards registry mutation tools with request IDs", async () => {
  const calls: unknown[] = [];
  const server = createBridgeServer({ remote: { call: async (call) => { calls.push(call); return success({ candidateId: "candidate-1" }); } } });
  const requestId = randomUUID();
  const args = {
    requestId,
    name: "shared-skill",
    baseReleaseHash: null,
    capabilities: ["filesystem-read"],
    provenance: [],
    files: [{ relativePath: "SKILL.md", mode: 0o644, content: "Use this skill." }]
  };
  const response = await server.handle({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "skill_propose", arguments: args } });
  assert.equal(response?.error, undefined);
  assert.deepEqual(calls, [{ name: "skill_propose", arguments: args, requestId }]);
});
test("forwards registry reader tools without mutation request IDs", async () => {
  const calls: unknown[] = [];
  const expected = success({ channels: [{ channel: "stable", sequence: "1", releases: [] }] });
  const server = createBridgeServer({ remote: { call: async (call) => { calls.push(call); return expected; } } });
  const response = await server.handle({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "skill_releases", arguments: { limit: 10 } }
  });
  assert.deepEqual(calls, [{ name: "skill_releases", arguments: { limit: 10 } }]);
  assert.deepEqual(response, { jsonrpc: "2.0", id: 11, result: expected });
});

test("offline failures become MCP tool errors instead of false local success", async () => {
  const unavailable = Object.assign(new Error("hub offline"), { code: "HUB_UNAVAILABLE", details: { retryable: "true" } });
  const server = createBridgeServer({ remote: { call: async () => { throw unavailable; } } });
  const response = await server.handle({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "brain_search", arguments: { query: "anything" } }
  });
  const result = response?.result as BridgeToolResult;

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    error: { code: "HUB_UNAVAILABLE", message: "hub offline", details: { retryable: "true" } }
  });
});

test("rejects unknown tools and malformed calls without invoking remote", async () => {
  let callCount = 0;
  const server = createBridgeServer({ remote: { call: async () => { callCount += 1; return success({}); } } });
  const unknown = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "brain_delete", arguments: {} } });
  const malformed = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "brain_read", arguments: [], extra: true } });

  assert.equal(unknown?.error?.code, -32602);
  assert.equal(malformed?.error?.code, -32602);
  assert.equal(callCount, 0);
});

function success(structuredContent: unknown): BridgeToolResult {
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
}
