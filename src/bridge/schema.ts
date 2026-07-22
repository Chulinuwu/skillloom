import { BridgeProtocolError } from "./errors.js";
import type {
  BridgeBrainToolName,
  BridgeInitializeParams,
  BridgeSkillToolName,
  BridgeToolCallParams,
  BridgeToolName,
  JsonRpcId,
  JsonRpcRequest
} from "./types.js";

const brainToolNames = new Set<BridgeBrainToolName>([
  "brain_search",
  "brain_retrieve",
  "brain_health",
  "brain_read",
  "brain_capture",
  "brain_update",
  "brain_link"
]);
const skillToolNames = new Set<BridgeSkillToolName>(["skill_releases", "skill_read", "skill_propose", "skill_publish"]);

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  const input = strictObject(value, ["jsonrpc", "id", "method", "params"], -32600, "Invalid Request");
  if (input.jsonrpc !== "2.0" || typeof input.method !== "string" || input.method.length === 0) {
    throw new BridgeProtocolError(-32600, "Invalid Request");
  }
  const id = input.id === undefined ? undefined : parseId(input.id);
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method: input.method,
    ...(input.params === undefined ? {} : { params: input.params })
  };
}

export function parseInitializeParams(value: unknown): BridgeInitializeParams {
  const input = strictParams(value, ["protocolVersion", "capabilities", "clientInfo"]);
  const clientInfo = strictObject(input.clientInfo, ["name", "version"], -32602, "Invalid initialize params");
  if (typeof input.protocolVersion !== "string" || input.protocolVersion.length === 0
    || !isRecord(input.capabilities)
    || typeof clientInfo.name !== "string" || clientInfo.name.length === 0
    || typeof clientInfo.version !== "string" || clientInfo.version.length === 0) {
    throw new BridgeProtocolError(-32602, "Invalid initialize params");
  }
  return {
    protocolVersion: input.protocolVersion,
    capabilities: input.capabilities,
    clientInfo: { name: clientInfo.name, version: clientInfo.version }
  };
}

export function parseEmptyParams(value: unknown): void {
  if (value === undefined) return;
  strictParams(value, []);
}

export function parseToolCallParams(value: unknown): BridgeToolCallParams {
  const input = strictParams(value, ["name", "arguments"]);
  if (!isToolName(input.name) || !isRecord(input.arguments)) {
    throw new BridgeProtocolError(-32602, "Invalid tools/call params");
  }
  return { name: input.name, arguments: input.arguments };
}

export function requestIdFrom(value: unknown): JsonRpcId | null {
  if (!isRecord(value) || !("id" in value)) return null;
  try {
    return parseId(value.id) ?? null;
  } catch {
    return null;
  }
}

function strictParams(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return strictObject(value ?? {}, keys, -32602, "Invalid params");
}

function strictObject(value: unknown, keys: readonly string[], code: number, message: string): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BridgeProtocolError(code, message);
  }
  return value;
}

function parseId(value: unknown): JsonRpcId | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new BridgeProtocolError(-32600, "Invalid Request");
}

function isToolName(value: unknown): value is BridgeToolName {
  return typeof value === "string"
    && (brainToolNames.has(value as BridgeBrainToolName) || skillToolNames.has(value as BridgeSkillToolName));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
