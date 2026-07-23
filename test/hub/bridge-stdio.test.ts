import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import {
  createBridgeServer,
  runBridgeStdio,
  type BridgeRemoteBrainPort,
  type BridgeSyncPort
} from "../../src/bridge/index.js";

function outputCollector(): { stream: Writable; read: () => string } {
  let output = "";
  return {
    stream: new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } }),
    read: () => output
  };
}

function remote(): BridgeRemoteBrainPort {
  return { call: async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { ok: true } }) };
}

test("stdio bridge handles partial and multiple newline-delimited messages", async () => {
  const input = new PassThrough();
  const stdout = outputCollector();
  const stderr = outputCollector();
  const sync: BridgeSyncPort = { syncOnce: async () => undefined };
  const running = runBridgeStdio({ input, output: stdout.stream, diagnostics: stderr.stream, remote: remote(), sync });

  input.write('{"jsonrpc":"2.0","id":1,"method":"init');
  input.write('ialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1","title":"Test Client"},"_meta":{}}}\n');
  input.end('{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":"p","method":"ping","params":{}}\n');
  await running;

  const messages = stdout.read().trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.id, 1);
  assert.equal((messages[0]?.result as { serverInfo: { name: string } }).serverInfo.name, "skillloom-bridge");
  assert.deepEqual(messages[1], { jsonrpc: "2.0", id: "p", result: {} });
  assert.equal(stderr.read(), "");
});

test("stdio bridge emits parse errors as protocol output and diagnostics only to stderr", async () => {
  const input = new PassThrough();
  const stdout = outputCollector();
  const stderr = outputCollector();
  const running = runBridgeStdio({ input, output: stdout.stream, diagnostics: stderr.stream, remote: remote() });

  input.end('{broken}\n{"jsonrpc":"2.0","id":1,"method":"unknown","params":{}}\n');
  await running;

  const messages = stdout.read().trim().split("\n").map((line) => JSON.parse(line) as { error: { code: number } });
  assert.deepEqual(messages.map((message) => message.error.code), [-32700, -32601]);
  assert.match(stderr.read(), /Malformed JSON/);
  assert.equal(stdout.read().split("\n").every((line) => line === "" || line.startsWith("{")), true);
});
test("stdio bridge forwards stable skill reader calls as one protocol response", async () => {
  const input = new PassThrough();
  const stdout = outputCollector();
  const calls: unknown[] = [];
  const running = runBridgeStdio({
    input,
    output: stdout.stream,
    remote: {
      call: async (call) => {
        calls.push(call);
        return {
          content: [{ type: "text", text: "stable release" }],
          structuredContent: { release: { releaseId: "release-1", channel: "stable" } }
        };
      }
    }
  });
  input.end('{"jsonrpc":"2.0","id":"read-1","method":"tools/call","params":{"name":"skill_read","arguments":{"releaseId":"release-1"}}}\n');
  await running;
  const response = JSON.parse(stdout.read().trim()) as { id: string; result: unknown };
  assert.equal(response.id, "read-1");
  assert.deepEqual(calls, [{ name: "skill_read", arguments: { releaseId: "release-1" } }]);
  assert.deepEqual(response.result, {
    content: [{ type: "text", text: "stable release" }],
    structuredContent: { release: { releaseId: "release-1", channel: "stable" } }
  });
});

test("stdio bridge accepts MCP request metadata on tool calls", async () => {
  const input = new PassThrough();
  const stdout = outputCollector();
  const calls: unknown[] = [];
  const running = runBridgeStdio({
    input,
    output: stdout.stream,
    remote: {
      call: async (call) => {
        calls.push(call);
        return { content: [{ type: "text", text: "[]" }], structuredContent: [] };
      }
    }
  });
  input.end(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "brain_search",
      arguments: { query: "scaling laws", limit: 5 },
      _meta: { progressToken: 2 }
    }
  })}\n`);
  await running;
  const response = JSON.parse(stdout.read().trim()) as { error?: { code: number } };
  assert.equal(response.error, undefined);
  assert.deepEqual(calls, [{ name: "brain_search", arguments: { query: "scaling laws", limit: 5 } }]);
});

test("notifications produce no response and initialize performs sync only once", async () => {
  let syncCount = 0;
  const sync: BridgeSyncPort = { syncOnce: async () => { syncCount += 1; } };
  const server = createBridgeServer({ remote: remote(), sync });
  const params = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } };

  assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }), undefined);
  await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params });
  await server.handle({ jsonrpc: "2.0", id: 2, method: "initialize", params });
  assert.equal(syncCount, 1);
});

test("strict JSON-RPC request and params validation returns standard errors", async () => {
  const server = createBridgeServer({ remote: remote() });
  const invalidId = await server.handle({ jsonrpc: "2.0", id: 1.5, method: "ping", params: {} });
  const invalidParams = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { extra: true } });
  const metadataParams = await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: { _meta: { progressToken: "list-3" } }
  });
  const invalidVersion = await server.handle({ jsonrpc: "1.0", id: 4, method: "ping" });

  assert.equal(invalidId?.error?.code, -32600);
  assert.equal(invalidParams?.error?.code, -32602);
  assert.equal(metadataParams?.error, undefined);
  assert.equal(invalidVersion?.error?.code, -32600);
});

test("invalid objects receive an Invalid Request response", async () => {
  const server = createBridgeServer({ remote: remote() });
  const response = await server.handle({ nope: true });

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32600, message: "Invalid Request" }
  });
});

test("initial sync is bounded and its failure stays off protocol output", async () => {
  let aborted = false;
  let resolveDiagnosis!: () => void;
  const diagnosis = new Promise<void>((resolve) => { resolveDiagnosis = resolve; });
  const sync: BridgeSyncPort = {
    syncOnce: (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    })
  };
  const diagnostics: string[] = [];
  const server = createBridgeServer({
    remote: remote(),
    sync,
    syncTimeoutMs: 5,
    diagnose: (line) => {
      diagnostics.push(line);
      resolveDiagnosis();
    }
  });
  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });

  assert.equal(response?.error, undefined);
  await diagnosis;
  assert.equal(aborted, true);
  assert.match(diagnostics[0] ?? "", /Initial sync failed/);
});

test("initialize returns before background sync finishes", async () => {
  let releaseSync!: () => void;
  const sync: BridgeSyncPort = {
    syncOnce: () => new Promise<void>((resolve) => { releaseSync = resolve; })
  };
  const server = createBridgeServer({ remote: remote(), sync });

  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });

  assert.equal(response?.error, undefined);
  releaseSync();
});
