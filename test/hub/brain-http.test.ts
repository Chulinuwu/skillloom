import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { createHubAuthorizationService, type HubAuthorizationContext } from "../../src/hub/auth/index.js";
import { createBrainService, type BrainPermissionPort } from "../../src/hub/brain/index.js";
import {
  createBrainHttpRequestListener,
  createBrainHttpRouter,
  createBrainHttpServer,
  listenBrainHttpServer,
  type BrainHttpResponse
} from "../../src/hub/http/index.js";
import { tempDir } from "../helpers/fixtures.js";

class AllowingPermissions implements BrainPermissionPort {
  async requireRead(): Promise<void> {}
  async requireWrite(): Promise<void> {}
}

function authorization(role: "reader" | "contributor" = "contributor"): HubAuthorizationContext {
  const actorId = `user:${role}@example.com`;
  return createHubAuthorizationService({
    actorRoles: { [actorId]: [role] },
    capabilityNamespaces: ["example.com/cap/skillloom"]
  }).authorize({ actorId, kind: "user", appCapabilities: [] });
}

function jsonRequest(method: string, url: string, body?: unknown, requestId?: string) {
  return {
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(requestId === undefined ? {} : { "idempotency-key": requestId })
    },
    ...(body === undefined ? {} : { body: Buffer.from(JSON.stringify(body)) })
  };
}

function errorCode(response: BrainHttpResponse): string | undefined {
  const body = response.body as { error?: { code?: string } };
  return body.error?.code;
}

test("routes brain HTTP operations through the authorized principal", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-http-"), permissions: new AllowingPermissions() });
  const router = createBrainHttpRouter(brain);
  const auth = authorization();
  try {
    const capture = await router.handle(jsonRequest("POST", "/v1/brain/captures", {
      type: "decision",
      title: "Central brain",
      content: "Markdown remains authoritative.",
      provenance: { source: "http-test" },
      sensitivity: "tailnet"
    }, randomUUID()), auth);
    assert.equal(capture.status, 201);
    const captured = capture.body as { requestId: string; accepted: true; data: { artifact: { id: string; createdBy: string } } };
    assert.equal(captured.accepted, true);
    assert.equal(captured.data.artifact.createdBy, auth.principal.actorId);

    const read = await router.handle(jsonRequest("GET", `/v1/brain/${captured.data.artifact.id}`), auth);
    assert.equal(read.status, 200);
    assert.equal((read.body as { data: { content: string } }).data.content, "Markdown remains authoritative.");

    const search = await router.handle(jsonRequest("POST", "/v1/brain/search", { query: "authoritative", limit: 5 }), auth);
    assert.equal(search.status, 200);
    assert.equal((search.body as { data: unknown[] }).data.length, 1);

    const update = await router.handle(jsonRequest("PUT", `/v1/brain/${captured.data.artifact.id}`, {
      baseRevision: "1",
      content: "Markdown remains the source of truth."
    }, randomUUID()), auth);
    assert.equal(update.status, 200);
    assert.equal((update.body as { data: { artifact: { revision: string } } }).data.artifact.revision, "2");

    const second = await router.handle(jsonRequest("POST", "/v1/brain/captures", {
      type: "source",
      title: "Source",
      content: "Supporting material.",
      provenance: {},
      sensitivity: "private"
    }, randomUUID()), auth);
    const secondId = (second.body as { data: { artifact: { id: string } } }).data.artifact.id;
    const link = await router.handle(jsonRequest("POST", `/v1/brain/${captured.data.artifact.id}/links`, {
      targetArtifactId: secondId,
      relationship: "supported-by"
    }, randomUUID()), auth);
    assert.equal(link.status, 201);
    assert.equal((link.body as { data: { link: { sourceArtifactId: string } } }).data.link.sourceArtifactId, captured.data.artifact.id);
  } finally {
    await brain.close();
  }
});

test("rejects missing idempotency, unknown fields, spoofed identity, and reader writes", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-http-validation-"), permissions: new AllowingPermissions() });
  const router = createBrainHttpRouter(brain);
  try {
    const input = {
      type: "note",
      title: "Strict input",
      content: "No transport identity is trusted.",
      provenance: {},
      sensitivity: "private"
    };
    const missingKey = await router.handle(jsonRequest("POST", "/v1/brain/captures", input), authorization());
    assert.equal(missingKey.status, 400);
    assert.equal(errorCode(missingKey), "BRAIN_HTTP_VALIDATION_ERROR");

    const unknownField = await router.handle(jsonRequest("POST", "/v1/brain/captures", { ...input, actorId: "user:attacker@example.com" }, randomUUID()), authorization());
    assert.equal(unknownField.status, 400);

    const forbidden = await router.handle(jsonRequest("POST", "/v1/brain/captures", input, randomUUID()), authorization("reader"));
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden), "HUB_FORBIDDEN");
  } finally {
    await brain.close();
  }
});

test("maps revision, idempotency, not-found, and malformed JSON errors deterministically", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-http-errors-"), permissions: new AllowingPermissions() });
  const router = createBrainHttpRouter(brain);
  const auth = authorization();
  const requestId = randomUUID();
  try {
    const capture = await router.handle(jsonRequest("POST", "/v1/brain/captures", {
      type: "note", title: "Conflicts", content: "one", provenance: {}, sensitivity: "private"
    }, requestId), auth);
    const id = (capture.body as { data: { artifact: { id: string } } }).data.artifact.id;
    const idempotency = await router.handle(jsonRequest("POST", "/v1/brain/captures", {
      type: "note", title: "Conflicts", content: "two", provenance: {}, sensitivity: "private"
    }, requestId), auth);
    assert.equal(idempotency.status, 409);
    assert.equal(errorCode(idempotency), "BRAIN_IDEMPOTENCY_CONFLICT");

    const revision = await router.handle(jsonRequest("PUT", `/v1/brain/${id}`, { baseRevision: "2", content: "stale" }, randomUUID()), auth);
    assert.equal(revision.status, 409);
    assert.equal(errorCode(revision), "BRAIN_REVISION_CONFLICT");

    const missing = await router.handle(jsonRequest("GET", "/v1/brain/00000000-0000-0000-0000-000000000000"), auth);
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing), "BRAIN_ARTIFACT_NOT_FOUND");

    const malformed = await router.handle({
      method: "POST",
      url: "/v1/brain/search",
      headers: { "content-type": "application/json" },
      body: Buffer.from("{")
    }, auth);
    assert.equal(malformed.status, 400);
    assert.equal(errorCode(malformed), "BRAIN_HTTP_INVALID_JSON");
  } finally {
    await brain.close();
  }
});

test("rejects an oversized JSON body before parsing", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-http-size-"), permissions: new AllowingPermissions() });
  const router = createBrainHttpRouter(brain);
  try {
    const response = await router.handle({
      method: "POST",
      url: "/v1/brain/search",
      headers: { "content-type": "application/json" },
      body: Buffer.alloc(2_250_001)
    }, authorization());
    assert.equal(response.status, 413);
    assert.equal(errorCode(response), "BRAIN_HTTP_BODY_TOO_LARGE");
  } finally {
    await brain.close();
  }
});

test("binds native HTTP only to loopback and serves through a separate listener", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-http-listener-"), permissions: new AllowingPermissions() });
  const router = createBrainHttpRouter(brain);
  const listener = createBrainHttpRequestListener({ router, authorize: () => authorization() });
  const server = createBrainHttpServer(listener);
  try {
    assert.throws(() => listenBrainHttpServer(server, { host: "0.0.0.0", port: 0 }), /loopback/i);
    await listenBrainHttpServer(server, { port: 0 });
    const address = server.address();
    assert.equal(typeof address === "object" && address?.address, "127.0.0.1");
    const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: typeof address === "object" && address ? address.port : 0, path: "/healthz" }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { data: { status: "ok" } });
  } finally {
    server.close();
    if (server.listening) await once(server, "close");
    await brain.close();
  }
});
