import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createHubAuthorizationService, type HubAuthorizationContext } from "../../src/hub/auth/index.js";
import { createBrainService, type BrainPermissionPort } from "../../src/hub/brain/index.js";
import { brainArtifactLayers, brainArtifactTypes } from "../../src/hub/brain/vocabulary.js";
import { createBrainMcpDispatcher, listBrainMcpTools } from "../../src/hub/mcp/index.js";
import { tempDir } from "../helpers/fixtures.js";

class AllowingPermissions implements BrainPermissionPort {
  async requireRead(): Promise<void> {}
  async requireWrite(): Promise<void> {}
}

function authorization(role: "reader" | "contributor" = "contributor"): HubAuthorizationContext {
  const actorId = `user:mcp-${role}@example.com`;
  return createHubAuthorizationService({ actorRoles: { [actorId]: [role] }, capabilityNamespaces: ["example.com/cap/skillloom"] })
    .authorize({ actorId, kind: "user", appCapabilities: [] });
}

test("publishes strict brain and registry tool definitions", () => {
  const tools = listBrainMcpTools();
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
  assert.ok(tools.every((tool) => tool.inputSchema.additionalProperties === false));
  for (const name of ["brain_search", "brain_read", "brain_capture", "brain_update", "brain_link"]) {
    assert.equal(tools.filter((tool) => tool.name === name).length, 1);
  }
  const propose = tools.find((tool) => tool.name === "skill_propose");
  const publish = tools.find((tool) => tool.name === "skill_publish");
  const releases = tools.find((tool) => tool.name === "skill_releases");
  const read = tools.find((tool) => tool.name === "skill_read");
  const retrieve = tools.find((tool) => tool.name === "brain_retrieve");
  assert.deepEqual(releases?.inputSchema.properties, {
    limit: { type: "integer", minimum: 1, maximum: 100 }
  });
  assert.ok((retrieve?.inputSchema.properties.filters as { properties: { statuses: unknown; hasSource: unknown } }).properties.statuses);
  assert.ok((retrieve?.inputSchema.properties.filters as { properties: { statuses: unknown; hasSource: unknown } }).properties.hasSource);
  assert.ok(((tools.find((tool) => tool.name === "brain_capture")?.inputSchema.properties.type as { enum: string[] }).enum).includes("bounded-episode"));
  const captureProperties = tools.find((tool) => tool.name === "brain_capture")?.inputSchema.properties ?? {};
  const updateProperties = tools.find((tool) => tool.name === "brain_update")?.inputSchema.properties ?? {};
  assert.ok(captureProperties.layer);
  assert.ok(captureProperties.source);
  assert.ok(captureProperties.details);
  assert.ok(updateProperties.layer);
  assert.ok(updateProperties.details);
  assert.equal((captureProperties.source as { additionalProperties: boolean }).additionalProperties, false);
  assert.ok((captureProperties.details as { anyOf: unknown[] }).anyOf.length > 0);
  assert.ok((updateProperties.details as { anyOf: unknown[] }).anyOf.length > 0);
  assert.deepEqual(read?.inputSchema.required, ["releaseId"]);
  assert.deepEqual(propose?.inputSchema.required, ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files"]);
  assert.deepEqual(publish?.inputSchema.required, ["requestId", "candidateId", "version", "channel"]);
  assert.deepEqual((publish?.inputSchema.properties.channel as { enum: string[] }).enum, ["stable"]);
});

test("publishes the canonical brain artifact vocabulary in MCP schemas", () => {
  const tools = listBrainMcpTools();
  const retrieve = tools.find((tool) => tool.name === "brain_retrieve");
  const capture = tools.find((tool) => tool.name === "brain_capture");
  const update = tools.find((tool) => tool.name === "brain_update");
  const filters = retrieve?.inputSchema.properties.filters as {
    properties: {
      types: { items: { enum: readonly string[] } };
      layers: { items: { enum: readonly string[] } };
    };
  };
  assert.deepEqual(filters.properties.types.items.enum, brainArtifactTypes);
  assert.deepEqual(filters.properties.layers.items.enum, brainArtifactLayers);
  assert.deepEqual((capture?.inputSchema.properties.type as { enum: readonly string[] }).enum, brainArtifactTypes);
  assert.deepEqual((update?.inputSchema.properties.type as { enum: readonly string[] }).enum, brainArtifactTypes);
});

test("dispatches MCP brain tools with equivalent structured results", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  const auth = authorization();
  try {
    const capture = await dispatch({ name: "brain_capture", arguments: {
      requestId: randomUUID(),
      type: "memory",
      layer: "agent-knowledge",
      title: "Shared context",
      content: "One source for every agent.",
      details: { kind: "none" },
      provenance: { source: "mcp-test" },
      source: {
        sourceId: "source:mcp-test",
        capturedAt: new Date(0).toISOString(),
        contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      sensitivity: "tailnet"
    } }, auth);
    assert.equal(capture.isError, undefined);
    const artifact = (capture.structuredContent as { artifact: { id: string; createdBy: string } }).artifact;
    assert.equal(artifact.createdBy, auth.principal.actorId);

    const read = await dispatch({ name: "brain_read", arguments: { artifactId: artifact.id } }, auth);
    assert.equal((read.structuredContent as { content: string }).content, "One source for every agent.");

    const search = await dispatch({ name: "brain_search", arguments: { query: "every agent" } }, auth);
    assert.equal((search.structuredContent as { results: unknown[] }).results.length, 1);
    const retrieve = await dispatch({ name: "brain_retrieve", arguments: { query: "every agent", tier: "standard", filters: { sensitivities: ["tailnet"], hasSource: true } } }, auth);
    assert.equal((retrieve.structuredContent as { results: unknown[]; hotContext: unknown[] }).results.length, 1);
    assert.equal((retrieve.structuredContent as { results: unknown[]; hotContext: unknown[] }).hotContext.length, 1);
    const health = await dispatch({ name: "brain_health", arguments: {} }, auth);
    assert.equal((health.structuredContent as { status: string }).status, "ok");

    const update = await dispatch({ name: "brain_update", arguments: {
      requestId: randomUUID(), artifactId: artifact.id, baseRevision: "1", content: "Shared by every authorized agent.", details: { kind: "none" }
    } }, auth);
    assert.equal((update.structuredContent as { artifact: { revision: string } }).artifact.revision, "2");

    const link = await dispatch({ name: "brain_link", arguments: {
      requestId: randomUUID(), sourceArtifactId: artifact.id, targetArtifactId: artifact.id, relationship: "related-to"
    } }, auth);
    assert.equal((link.structuredContent as { link: { sourceArtifactId: string } }).link.sourceArtifactId, artifact.id);
  } finally {
    await brain.close();
  }
});
test("rejects malformed structured brain capture and update fields before dispatch", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-structured-validation-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  const auth = authorization();
  try {
    const malformedSource = await dispatch({ name: "brain_capture", arguments: {
      requestId: randomUUID(),
      type: "workflow",
      layer: "workflow",
      title: "Malformed source",
      content: "",
      provenance: {},
      source: { sourceId: "x", capturedAt: "not-a-date", contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      sensitivity: "private"
    } }, auth);
    assert.equal(malformedSource.isError, true);
    assert.equal((malformedSource.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");
    const malformedDetails = await dispatch({ name: "brain_update", arguments: {
      requestId: randomUUID(),
      artifactId: randomUUID(),
      baseRevision: "1",
      details: { kind: "workflow", trigger: "missing steps", promotable: false }
    } }, auth);
    assert.equal(malformedDetails.isError, true);
    assert.equal((malformedDetails.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");
    const unknownStructuredField = await dispatch({ name: "brain_capture", arguments: {
      requestId: randomUUID(),
      type: "note",
      title: "Unknown details field",
      content: "",
      provenance: {},
      detailsExtra: { kind: "none" },
      sensitivity: "private"
    } }, auth);
    assert.equal(unknownStructuredField.isError, true);
    assert.equal((unknownStructuredField.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");
  } finally {
    await brain.close();
  }
});

test("returns strict validation and authorization errors without dispatching identity input", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-errors-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  try {
    const unknownField = await dispatch({ name: "brain_search", arguments: { query: "x", actorId: "user:attacker@example.com" } }, authorization());
    assert.equal(unknownField.isError, true);
    assert.equal((unknownField.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");

    const forbidden = await dispatch({ name: "brain_capture", arguments: {
      requestId: randomUUID(), type: "note", title: "Denied", content: "", provenance: {}, sensitivity: "private"
    } }, authorization("reader"));
    assert.equal(forbidden.isError, true);
    assert.equal((forbidden.structuredContent as { error: { code: string } }).error.code, "HUB_FORBIDDEN");

    const unknownTool = await dispatch({ name: "brain_delete", arguments: {} }, authorization());
    assert.equal(unknownTool.isError, true);
    assert.equal((unknownTool.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_TOOL_NOT_FOUND");
  } finally {
    await brain.close();
  }
});

test("rejects unknown brain retrieve filter fields before dispatch", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-retrieve-validation-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  try {
    const result = await dispatch({ name: "brain_retrieve", arguments: { query: "x", filters: { actorId: "user:attacker@example.com" } } }, authorization());
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");
  } finally {
    await brain.close();
  }
});

test("rejects brain health arguments before dispatch", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-health-validation-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  try {
    const result = await dispatch({ name: "brain_health", arguments: { query: "x" } }, authorization());
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "BRAIN_MCP_VALIDATION_ERROR");
  } finally {
    await brain.close();
  }
});

test("preserves business conflict and not-found codes in MCP errors", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-business-errors-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  const auth = authorization();
  const requestId = randomUUID();
  try {
    const capture = await dispatch({ name: "brain_capture", arguments: {
      requestId, type: "note", title: "Conflict", content: "one", provenance: {}, sensitivity: "private"
    } }, auth);
    const artifactId = (capture.structuredContent as { artifact: { id: string } }).artifact.id;

    const idempotency = await dispatch({ name: "brain_capture", arguments: {
      requestId, type: "note", title: "Conflict", content: "two", provenance: {}, sensitivity: "private"
    } }, auth);
    assert.equal((idempotency.structuredContent as { error: { code: string } }).error.code, "BRAIN_IDEMPOTENCY_CONFLICT");

    const revision = await dispatch({ name: "brain_update", arguments: {
      requestId: randomUUID(), artifactId, baseRevision: "2", content: "stale"
    } }, auth);
    assert.equal((revision.structuredContent as { error: { code: string } }).error.code, "BRAIN_REVISION_CONFLICT");

    const missing = await dispatch({ name: "brain_read", arguments: { artifactId: "00000000-0000-0000-0000-000000000000" } }, auth);
    assert.equal((missing.structuredContent as { error: { code: string } }).error.code, "BRAIN_ARTIFACT_NOT_FOUND");
  } finally {
    await brain.close();
  }
});
