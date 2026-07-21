import type { BridgeToolResult, JsonRpcError, JsonRpcId, JsonRpcResponse } from "./types.js";

export class BridgeProtocolError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
  }
}

export function protocolError(id: JsonRpcId | null, error: BridgeProtocolError): JsonRpcResponse {
  const body: JsonRpcError = {
    code: error.code,
    message: error.message,
    ...(error.data === undefined ? {} : { data: error.data })
  };
  return { jsonrpc: "2.0", id, error: body };
}

export function remoteToolError(error: unknown): BridgeToolResult {
  const source = errorRecord(error);
  const structuredContent = {
    error: {
      code: typeof source.code === "string" ? source.code : "BRIDGE_REMOTE_ERROR",
      message: error instanceof Error ? error.message : "Remote brain request failed",
      ...(isRecord(source.details) ? { details: source.details } : {})
    }
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function errorRecord(error: unknown): Record<string, unknown> {
  return typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}
