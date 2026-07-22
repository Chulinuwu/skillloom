import type { HubAuthorizationContext, HubPermission } from "../auth/index.js";
import type { BrainService } from "../brain/index.js";
import { brainMcpErrorResult, BrainMcpError } from "./errors.js";
import {
  parseBrainMcpCapture,
  parseBrainMcpLink,
  parseBrainMcpRead,
  parseBrainMcpRetrieve,
  parseBrainMcpHealth,
  parseBrainMcpSearch,
  parseBrainMcpUpdate
} from "./schema.js";
import type { BrainMcpCall, BrainMcpDispatcher, BrainMcpResult } from "./types.js";

export function createBrainMcpDispatcher(brain: BrainService): BrainMcpDispatcher {
  return async (call, authorization) => {
    try {
      return success(await dispatchBrainMcpCall(brain, call, authorization));
    } catch (error) {
      return brainMcpErrorResult(error);
    }
  };
}

async function dispatchBrainMcpCall(brain: BrainService, call: BrainMcpCall, authorization: HubAuthorizationContext): Promise<unknown> {
  const actor = { actorId: authorization.principal.actorId };
  if (call.name === "brain_search") {
    requirePermission(authorization, "brain:read");
    return { results: await brain.search({ actor, ...parseBrainMcpSearch(call.arguments) }) };
  }
  if (call.name === "brain_retrieve") {
    requirePermission(authorization, "brain:read");
    return await brain.retrieve({ actor, ...parseBrainMcpRetrieve(call.arguments) });
  }
  if (call.name === "brain_health") {
    requirePermission(authorization, "brain:read");
    parseBrainMcpHealth(call.arguments);
    return await brain.health({ actor });
  }
  if (call.name === "brain_read") {
    requirePermission(authorization, "brain:read");
    return await brain.read({ actor, ...parseBrainMcpRead(call.arguments) });
  }
  if (call.name === "brain_capture") {
    requirePermission(authorization, "brain:capture");
    return await brain.capture({ actor, ...parseBrainMcpCapture(call.arguments) });
  }
  if (call.name === "brain_update") {
    requirePermission(authorization, "brain:update");
    return await brain.update({ actor, ...parseBrainMcpUpdate(call.arguments) });
  }
  if (call.name === "brain_link") {
    requirePermission(authorization, "brain:link");
    return await brain.link({ actor, ...parseBrainMcpLink(call.arguments) });
  }
  throw new BrainMcpError("BRAIN_MCP_TOOL_NOT_FOUND", `Unknown brain tool: ${call.name}`);
}

function requirePermission(authorization: HubAuthorizationContext, permission: HubPermission): void {
  authorization.require(permission);
}

function success(structuredContent: unknown): BrainMcpResult {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}
