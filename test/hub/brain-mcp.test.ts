import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createHubAuthorizationService, type HubAuthorizationContext } from "../../src/hub/auth/index.js";
import { createBrainService, type BrainPermissionPort } from "../../src/hub/brain/index.js";
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
  assert.deepEqual(releases?.inputSchema.properties, {
    limit: { type: "integer", minimum: 1, maximum: 100 }
  });
  assert.deepEqual(read?.inputSchema.required, ["releaseId"]);
  assert.deepEqual(propose?.inputSchema.required, ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files"]);
  assert.deepEqual(publish?.inputSchema.required, ["requestId", "candidateId", "version", "channel"]);
  assert.deepEqual((publish?.inputSchema.properties.channel as { enum: string[] }).enum, ["stable"]);
});

test("dispatches MCP brain tools with equivalent structured results", async () => {
  const brain = await createBrainService({ root: await tempDir("skillloom-mcp-"), permissions: new AllowingPermissions() });
  const dispatch = createBrainMcpDispatcher(brain);
  const auth = authorization();
  try {
    const capture = await dispatch({ name: "brain_capture", arguments: {
      requestId: randomUUID(),
      type: "memory",
      title: "Shared context",
      content: "One source for every agent.",
      provenance: { source: "mcp-test" },
      sensitivity: "tailnet"
    } }, auth);
    assert.equal(capture.isError, undefined);
    const artifact = (capture.structuredContent as { artifact: { id: string; createdBy: string } }).artifact;
    assert.equal(artifact.createdBy, auth.principal.actorId);

    const read = await dispatch({ name: "brain_read", arguments: { artifactId: artifact.id } }, auth);
    assert.equal((read.structuredContent as { content: string }).content, "One source for every agent.");

    const search = await dispatch({ name: "brain_search", arguments: { query: "every agent" } }, auth);
    assert.equal((search.structuredContent as { results: unknown[] }).results.length, 1);

    const update = await dispatch({ name: "brain_update", arguments: {
      requestId: randomUUID(), artifactId: artifact.id, baseRevision: "1", content: "Shared by every authorized agent."
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
