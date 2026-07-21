import type { Readable, Writable } from "node:stream";

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: JsonRpcError;
};

export type BridgeTextContent = {
  type: "text";
  text: string;
};

export type BridgeToolResult = {
  content: BridgeTextContent[];
  structuredContent: unknown;
  isError?: true;
};

export type BridgeBrainToolName =
  | "brain_search"
  | "brain_read"
  | "brain_capture"
  | "brain_update"
  | "brain_link";
export type BridgeSkillToolName = "skill_releases" | "skill_read" | "skill_propose" | "skill_publish";
export type BridgeToolName = BridgeBrainToolName | BridgeSkillToolName;

export type BridgeInitializeParams = {
  protocolVersion: string;
  capabilities: Readonly<Record<string, unknown>>;
  clientInfo: { name: string; version: string };
};

export type BridgeToolCallParams = {
  name: BridgeToolName;
  arguments: Readonly<Record<string, unknown>>;
};

export type BridgeRemoteBrainCall = {
  name: BridgeBrainToolName;
  arguments: Readonly<Record<string, unknown>>;
  requestId?: string;
};

export type BridgeRemoteSkillCall = {
  name: BridgeSkillToolName;
  arguments: Readonly<Record<string, unknown>>;
  requestId?: string;
};

export type BridgeRemoteToolCall = BridgeRemoteBrainCall | BridgeRemoteSkillCall;

export type BridgeRemoteToolPort = {
  call(call: BridgeRemoteToolCall): Promise<BridgeToolResult>;
};

export type BridgeRemoteBrainPort = BridgeRemoteToolPort;

export type BridgeSyncPort = {
  syncOnce(signal: AbortSignal): Promise<void>;
};

export type BridgeServer = {
  handle(message: unknown): Promise<JsonRpcResponse | undefined>;
};

export type BridgeServerOptions = {
  remote: BridgeRemoteBrainPort;
  sync?: BridgeSyncPort;
  syncTimeoutMs?: number;
  diagnose?: (message: string) => void;
};

export type BridgeStdioOptions = Omit<BridgeServerOptions, "diagnose"> & {
  input?: Readable;
  output?: Writable;
  diagnostics?: Writable;
};
