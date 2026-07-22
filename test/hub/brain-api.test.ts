import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createBrainApi, createHubHttpClient, drainPendingHubMutations } from "../../src/hub/client/index.js";
import { enqueuePendingMutation, readHubPendingMutations } from "../../src/hub/config/index.js";
import { tempDir } from "../helpers/fixtures.js";

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-1",
    type: "decision",
    layer: "human-knowledge",
    path: "vault/inbox/artifact-1.md",
    revision: "1",
    contentHash: `sha256:${"a".repeat(64)}`,
    title: "Shared",
    frontmatter: {},
    provenance: {},
    details: { kind: "knowledge", status: "accepted" },
    sensitivity: "tailnet",
    createdAt: "2026-07-21T00:00:00.000Z",
    createdBy: "user:owner@example.com",
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: "user:owner@example.com",
    ...overrides
  };
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

test("brain retrieve parses ranked context envelopes without creating pending mutations", async () => {
  const root = await tempDir("skillloom-brain-api-retrieve-");
  let captured: RequestInit | undefined;
  const api = createBrainApi(root, createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async (_url, init) => {
      captured = init;
      return response({ data: {
        tier: "standard",
        query: "shared",
        filters: { statuses: ["accepted"], hasSource: false },
        recoveredIndex: true,
        results: [{
          ...artifact(),
          excerpt: "Shared context",
          score: 1,
          graphDistance: 0,
          reasons: [{ kind: "title", weight: 1, detail: "title match" }],
          decorations: { contradictions: [], gaps: [] }
        }],
        hotContext: [{ artifactId: "artifact-1", type: "decision", title: "Shared", score: 1, excerpt: "Shared context", content: "Shared context" }]
      } });
    },
    retry: { maxAttempts: 1, baseDelayMs: 1 }
  }));
  const result = await api.retrieve({ query: "shared", tier: "standard", filters: { statuses: ["accepted"], hasSource: false } });
  assert.equal(captured?.method, "POST");
  assert.equal(new Headers(captured?.headers).get("idempotency-key"), null);
  assert.equal(result.recoveredIndex, true);
  assert.equal(result.results[0]?.details.kind, "knowledge");
  assert.deepEqual(await readHubPendingMutations(root), []);
});

test("brain health parses index consistency counters", async () => {
  const root = await tempDir("skillloom-brain-api-health-");
  const api = createBrainApi(root, createHubHttpClient({
    baseUrl: "https://hub.example.test",
    fetch: async () => response({ data: {
      status: "degraded",
      checkedAt: "2026-07-21T00:00:00.000Z",
      canonicalArtifacts: 2,
      indexedArtifacts: 1,
      auditEvents: 3,
      indexedAuditEvents: 2,
      indexedLinks: 1,
      unresolvedGaps: 1,
      contradictions: 1,
      recoveredIndex: true,
      issues: [{ code: "stale-index-artifact", severity: "warning", detail: "stale", artifactId: "artifact-1" }],
      recommendations: ["rebuild index"]
    } }),
    retry: { maxAttempts: 1, baseDelayMs: 1 }
  }));
  const health = await api.health();
  assert.equal(health.contradictions, 1);
  assert.equal(health.recoveredIndex, true);
  assert.equal(health.issues[0]?.code, "stale-index-artifact");
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
