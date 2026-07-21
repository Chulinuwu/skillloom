import assert from "node:assert/strict";
import test from "node:test";
import {
  HubHttpError,
  HubResponseValidationError,
  HubTimeoutError,
  HubUnavailableError,
  createHubHttpClient
} from "../../src/hub/client/index.js";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers }
  });
}

test("retries a safe read after network ambiguity with bounded injected timing", async () => {
  let calls = 0;
  const delays: number[] = [];
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("offline");
      return jsonResponse({ ok: true });
    },
    clock: { now: () => 1, sleep: async (ms) => { delays.push(ms); } },
    timeout: { set: () => 1, clear: () => undefined },
    retry: { maxAttempts: 2, baseDelayMs: 10 },
    jitter: (delay) => delay,
    timeoutMs: 100
  });
  assert.deepEqual(await client.request({ method: "GET", path: "/health", parse: (value) => value }), { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [10]);
});

test("reuses one idempotency key for a replayable mutation", async () => {
  const keys: string[] = [];
  let calls = 0;
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async (_url, init) => {
      keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      calls += 1;
      return calls === 1 ? jsonResponse({ error: "busy" }, { status: 503 }) : jsonResponse({ requestId: REQUEST_ID, accepted: true, data: {} });
    },
    clock: { now: () => 1, sleep: async () => undefined },
    timeout: { set: () => 1, clear: () => undefined },
    retry: { maxAttempts: 2, baseDelayMs: 1 },
    timeoutMs: 100
  });
  await client.request({
    mutation: {
      version: 1,
      method: "POST",
      path: "/v1/brain/capture",
      body: "{\"content\":\"hello\"}",
      bodyHash: "sha256:ILLdqUDXQdl4CJcgCq7y7zVqsys4x94NlDBvtaZrSo4",
      requestId: REQUEST_ID,
      createdAt: "2026-07-21T00:00:00.000Z"
    },
    replayable: true,
    parse: (value) => value
  });
  assert.deepEqual(keys, [REQUEST_ID, REQUEST_ID]);
});

test("does not retry auth, conflict, schema, or non-replayable mutation failures", async () => {
  for (const status of [400, 401, 403, 409, 422, 500]) {
    let calls = 0;
    const client = createHubHttpClient({
      baseUrl: "https://hub.example.test",
      fetch: async () => { calls += 1; return jsonResponse({ error: "no" }, { status }); },
      clock: { now: () => 1, sleep: async () => undefined },
      timeout: { set: () => 1, clear: () => undefined },
      retry: { maxAttempts: 3, baseDelayMs: 1 },
      timeoutMs: 100
    });
    await assert.rejects(() => client.request({ method: "GET", path: "/x", parse: (value) => value }), HubHttpError);
    assert.equal(calls, 1);
  }
});

test("reports typed offline failure after bounded retries", async () => {
  let calls = 0;
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async () => { calls += 1; throw new TypeError("offline"); },
    clock: { now: () => 1, sleep: async () => undefined },
    timeout: { set: () => 1, clear: () => undefined },
    retry: { maxAttempts: 2, baseDelayMs: 1 },
    timeoutMs: 100
  });
  await assert.rejects(() => client.request({ method: "GET", path: "/x", parse: (value) => value }), HubUnavailableError);
  assert.equal(calls, 2);
});

test("does not retry a non-replayable mutation after network ambiguity", async () => {
  let calls = 0;
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async () => { calls += 1; throw new TypeError("ambiguous"); },
    clock: { now: () => 1, sleep: async () => undefined },
    timeout: { set: () => 1, clear: () => undefined },
    retry: { maxAttempts: 3, baseDelayMs: 1 },
    timeoutMs: 100
  });
  await assert.rejects(() => client.request({
    mutation: {
      version: 1,
      method: "POST",
      path: "/v1/brain/capture",
      body: "{\"content\":\"hello\"}",
      bodyHash: "sha256:ILLdqUDXQdl4CJcgCq7y7zVqsys4x94NlDBvtaZrSo4",
      requestId: REQUEST_ID,
      createdAt: "2026-07-21T00:00:00.000Z"
    },
    replayable: false,
    parse: (value) => value
  }), HubUnavailableError);
  assert.equal(calls, 1);
});

test("reports an injected timeout without retrying an unsafe operation", async () => {
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async (_url, init) => { throw init?.signal?.reason; },
    clock: { now: () => 1, sleep: async () => undefined },
    timeout: { set: (handler) => { handler(); return 1; }, clear: () => undefined },
    retry: { maxAttempts: 3, baseDelayMs: 1 },
    timeoutMs: 100
  });
  await assert.rejects(() => client.request({
    mutation: {
      version: 1,
      method: "POST",
      path: "/v1/brain/capture",
      body: "{\"content\":\"hello\"}",
      bodyHash: "sha256:ILLdqUDXQdl4CJcgCq7y7zVqsys4x94NlDBvtaZrSo4",
      requestId: REQUEST_ID,
      createdAt: "2026-07-21T00:00:00.000Z"
    },
    replayable: false,
    parse: (value) => value
  }), HubTimeoutError);
});

test("honors Retry-After with injected jitter and a hard upper bound", async () => {
  let calls = 0;
  const delays: number[] = [];
  const jitterInputs: Array<[number, number]> = [];
  const client = createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: "busy" }, { status: 503, headers: { "retry-after": "120" } })
        : jsonResponse({ ok: true });
    },
    clock: { now: () => 1, sleep: async (milliseconds) => { delays.push(milliseconds); } },
    timeout: { set: () => 1, clear: () => undefined },
    retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 20, maxRetryAfterMs: 250 },
    jitter: (delay, attempt) => { jitterInputs.push([delay, attempt]); return delay + 10_000; },
    timeoutMs: 100
  });
  await client.request({ method: "GET", path: "/health", parse: (value) => value });
  assert.deepEqual(jitterInputs, [[250, 1]]);
  assert.deepEqual(delays, [250]);
});

test("rejects redirects, oversized bodies, and non-JSON responses", async () => {
  for (const response of [
    new Response("moved", { status: 302, headers: { location: "https://evil.test" } }),
    new Response("x".repeat(33), { headers: { "content-type": "application/json", "content-length": "33" } }),
    new Response("ok", { headers: { "content-type": "text/plain" } })
  ]) {
    let redirect: RequestRedirect | undefined;
    const client = createHubHttpClient({
      baseUrl: "https://hub.example.test",
      fetch: async (_url, init) => { redirect = init?.redirect; return response; },
      clock: { now: () => 1, sleep: async () => undefined },
      timeout: { set: () => 1, clear: () => undefined },
      retry: { maxAttempts: 1, baseDelayMs: 1 },
      timeoutMs: 100,
      maxResponseBytes: 32
    });
    await assert.rejects(() => client.request({ method: "GET", path: "/x", parse: (value) => value }), (error) => error instanceof HubHttpError || error instanceof HubResponseValidationError);
    assert.equal(redirect, "error");
  }
});
