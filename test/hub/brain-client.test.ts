import assert from "node:assert/strict";
import test from "node:test";
import { createBrainApi } from "../../src/hub/client/index.js";
import type { HubHttpClient, HubRequest } from "../../src/hub/client/transport-types.js";

const metadata = {
  id: "00000000-0000-0000-0000-000000000001",
  type: "fact",
  layer: "human-knowledge",
  path: "vault/inbox/00000000-0000-0000-0000-000000000001.md",
  revision: "1",
  contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  title: "Client retrieval",
  frontmatter: {},
  provenance: {},
  details: { kind: "knowledge", status: "accepted" },
  sensitivity: "tailnet",
  createdAt: "2026-07-22T00:00:00.000Z",
  createdBy: "user:test@example.com",
  updatedAt: "2026-07-22T00:00:00.000Z",
  updatedBy: "user:test@example.com"
};

test("client exposes retrieve and health contracts with strict response parsing", async () => {
  const calls: string[] = [];
  const client: HubHttpClient = {
    async request<T>(request: HubRequest<T>): Promise<T> {
      calls.push("path" in request ? request.path : request.mutation.path);
      if ("path" in request && request.path === "/v1/brain/retrieve") {
        return request.parse({ data: {
          tier: "deep",
          query: "client",
          filters: { hasSource: false },
          recoveredIndex: false,
          results: [{
            ...metadata,
            excerpt: "Client retrieval",
            score: 26,
            graphDistance: 0,
            reasons: [{ kind: "title", weight: 12, detail: "title matches client" }],
            decorations: { contradictions: [], gaps: [] }
          }],
          hotContext: [{ artifactId: metadata.id, type: "fact", title: metadata.title, score: 26, excerpt: "Client retrieval", content: "Client retrieval content." }],
          health: {
            status: "ok",
            checkedAt: "2026-07-22T00:00:00.000Z",
            canonicalArtifacts: 1,
            indexedArtifacts: 1,
            auditEvents: 1,
            indexedAuditEvents: 1,
            indexedLinks: 0,
            unresolvedGaps: 0,
            contradictions: 0,
            recoveredIndex: false,
            issues: [],
            recommendations: []
          }
        } });
      }
      if ("path" in request && request.path === "/v1/brain/health") {
        return request.parse({ data: {
          status: "ok",
          checkedAt: "2026-07-22T00:00:00.000Z",
          canonicalArtifacts: 1,
          indexedArtifacts: 1,
          auditEvents: 1,
          indexedAuditEvents: 1,
          indexedLinks: 0,
          unresolvedGaps: 0,
          contradictions: 0,
          recoveredIndex: false,
          issues: [],
          recommendations: []
        } });
      }
      throw new Error("unexpected request");
    }
  };
  const api = createBrainApi("/tmp/skillloom-client-test", client);
  const retrieval = await api.retrieve({ query: "client", tier: "deep", filters: { hasSource: false } });
  const health = await api.health();
  assert.deepEqual(calls, ["/v1/brain/retrieve", "/v1/brain/health"]);
  assert.equal(retrieval.results[0]?.reasons[0]?.kind, "title");
  assert.equal(retrieval.recoveredIndex, false);
  assert.equal(retrieval.health?.status, "ok");
  assert.equal(health.contradictions, 0);
  assert.equal(health.status, "ok");
});
