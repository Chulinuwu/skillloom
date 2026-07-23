import { listBrainMcpTools } from "../hub/mcp/index.js";
import { BridgeProtocolError, protocolError, remoteToolError } from "./errors.js";
import {
  parseEmptyParams,
  parseInitializeParams,
  parseJsonRpcRequest,
  parseToolCallParams,
  requestIdFrom
} from "./schema.js";
import type {
  BridgeRemoteToolCall,
  BridgeServer,
  BridgeServerOptions,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse
} from "./types.js";

const defaultSyncTimeoutMs = 5_000;

export function createBridgeServer(options: BridgeServerOptions): BridgeServer {
  let syncStarted = false;
  return {
    handle: async (message) => {
      const notification = isNotification(message);
      try {
        const request = parseJsonRpcRequest(message);
        if (notification) {
          await handleNotification(request);
          return undefined;
        }
        return await handleRequest(request);
      } catch (error) {
        if (notification) return undefined;
        const mapped = error instanceof BridgeProtocolError
          ? error
          : new BridgeProtocolError(-32603, "Internal error");
        return protocolError(requestIdFrom(message), mapped);
      }
    }
  };

  async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = request.id as JsonRpcId;
    if (request.method === "initialize") {
      const params = parseInitializeParams(request.params);
      if (!syncStarted) {
        syncStarted = true;
        void attemptSync(options);
      }
      return success(id, {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "skillloom-bridge", version: "0.3.4" }
      });
    }
    if (request.method === "ping") {
      parseEmptyParams(request.params);
      return success(id, {});
    }
    if (request.method === "tools/list") {
      parseEmptyParams(request.params);
      return success(id, { tools: listBrainMcpTools() });
    }
    if (request.method === "tools/call") {
      const params = parseToolCallParams(request.params);
      const call: BridgeRemoteToolCall = {
        name: params.name,
        arguments: params.arguments,
        ...mutationRequestId(params.name, params.arguments)
      };
      try {
        return success(id, await options.remote.call(call));
      } catch (error) {
        return success(id, remoteToolError(error));
      }
    }
    throw new BridgeProtocolError(-32601, "Method not found");
  }

  async function handleNotification(request: JsonRpcRequest): Promise<void> {
    if (request.method !== "notifications/initialized") return;
    parseEmptyParams(request.params);
  }
}

async function attemptSync(options: BridgeServerOptions): Promise<void> {
  if (options.sync === undefined) return;
  const timeoutMs = options.syncTimeoutMs ?? defaultSyncTimeoutMs;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      options.sync.syncOnce(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Initial sync timed out"));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    options.diagnose?.(`Initial sync failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function success(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function mutationRequestId(
  name: BridgeRemoteToolCall["name"],
  args: Readonly<Record<string, unknown>>
): Pick<BridgeRemoteToolCall, "requestId"> | Record<string, never> {
  if (name !== "brain_capture" && name !== "brain_update" && name !== "brain_link" && name !== "skill_propose" && name !== "skill_publish") return {};
  return typeof args.requestId === "string" ? { requestId: args.requestId } : {};
}

function isNotification(message: unknown): boolean {
  return typeof message === "object"
    && message !== null
    && !Array.isArray(message)
    && (message as Record<string, unknown>).jsonrpc === "2.0"
    && typeof (message as Record<string, unknown>).method === "string"
    && !("id" in message);
}
