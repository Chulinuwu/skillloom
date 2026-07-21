import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createBrainApi, createHubHttpClient, drainPendingHubMutations } from "../../src/hub/client/index.js";
import { enqueuePendingMutation, readHubPendingMutations } from "../../src/hub/config/index.js";
import { tempDir } from "../helpers/fixtures.js";

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

test("brain search is an idempotent POST query without a pending mutation", async () => {
  const root = await tempDir("skillloom-brain-api-search-");
  let captured: RequestInit | undefined;
  const api = createBrainApi(root, createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async (_url, init) => {
      captured = init;
      return response({ data: [] });
    },
    retry: { maxAttempts: 1, baseDelayMs: 1 }
  }));
  assert.deepEqual(await api.search({ query: "shared context", limit: 5 }), []);
  assert.equal(captured?.method, "POST");
  assert.equal(new Headers(captured?.headers).get("idempotency-key"), null);
  assert.deepEqual(await readHubPendingMutations(root), []);
});

test("brain mutations persist until the exact acknowledgement envelope is received", async () => {
  const root = await tempDir("skillloom-brain-api-mutation-");
  const requestId = randomUUID();
  let observedKey = "";
  const api = createBrainApi(root, createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async (_url, init) => {
      observedKey = new Headers(init?.headers).get("idempotency-key") ?? "";
      return response({
        requestId,
        accepted: true,
        data: {
          kind: "artifact",
          artifact: {
            id: "artifact-1",
            type: "note",
            path: "vault/inbox/artifact-1.md",
            revision: "1",
            contentHash: `sha256:${"a".repeat(64)}`,
            title: "Shared",
            frontmatter: {},
            provenance: {},
            sensitivity: "tailnet",
            createdAt: "2026-07-21T00:00:00.000Z",
            createdBy: "user:owner@example.com",
            updatedAt: "2026-07-21T00:00:00.000Z",
            updatedBy: "user:owner@example.com"
          },
          eventSequence: "1"
        }
      });
    },
    retry: { maxAttempts: 1, baseDelayMs: 1 }
  }));
  const result = await api.capture(requestId, {
    type: "note",
    title: "Shared",
    content: "One brain",
    provenance: {},
    sensitivity: "tailnet"
  });
  assert.equal(observedKey, requestId);
  assert.equal(result.kind, "artifact");
  assert.deepEqual(await readHubPendingMutations(root), []);
});

test("pending mutations drain FIFO with their original request IDs and stop on a mismatched ack", async () => {
  const root = await tempDir("skillloom-brain-api-drain-");
  const first = randomUUID();
  const second = randomUUID();
  for (const [requestId, createdAt] of [[second, "2026-07-21T00:00:02.000Z"], [first, "2026-07-21T00:00:01.000Z"]] as const) {
    await enqueuePendingMutation(root, { requestId, method: "POST", path: "/v1/brain/captures", body: "{}", createdAt });
  }
  const sent: string[] = [];
  await assert.rejects(() => drainPendingHubMutations(root, {
    request: async (request) => {
      if (!("mutation" in request)) throw new Error("expected mutation");
      sent.push(request.mutation.requestId);
      return request.parse({ requestId: second, accepted: true, data: {} });
    }
  }), /acknowledgement/i);
  assert.deepEqual(sent, [first]);
  assert.deepEqual((await readHubPendingMutations(root)).map((item) => item.requestId).sort(), [first, second].sort());
});
