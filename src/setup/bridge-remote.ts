import type { BridgeRemoteBrainCall, BridgeRemoteSkillCall, BridgeRemoteToolCall, BridgeRemoteToolPort } from "../bridge/index.js";
import type { BrainApi, RegistryMutationApi, RegistryReadApi } from "../hub/client/index.js";
import {
  parseBrainMcpCapture,
  parseBrainMcpLink,
  parseBrainMcpRead,
  parseBrainMcpSearch,
  parseBrainMcpUpdate,
  parseRegistryMcpPropose,
  parseRegistryMcpPublish
} from "../hub/mcp/schema.js";
import { parseRegistryMcpRead, parseRegistryMcpReleases } from "../hub/mcp/registry-read-schema.js";

export type HubBridgeApis = Readonly<{ brain: BrainApi; registry: RegistryMutationApi & RegistryReadApi }>;

export class BrainApiBridgeAdapter implements BridgeRemoteToolPort {
  constructor(private readonly api: BrainApi) {}
  async call(call: BridgeRemoteToolCall) {
    if (!isBrainCall(call)) throw new Error(`Unsupported bridge tool: ${call.name}`);
    const value = await dispatchBrain(this.api, call);
    return toolResult(value);
  }
}

export class HubApiBridgeAdapter implements BridgeRemoteToolPort {
  constructor(private readonly apis: HubBridgeApis) {}
  async call(call: BridgeRemoteToolCall) {
    const value = isBrainCall(call)
      ? await dispatchBrain(this.apis.brain, call)
      : await dispatchRegistry(this.apis.registry, call);
    return toolResult(value);
  }
}

export class LazyBrainApiBridgeAdapter implements BridgeRemoteToolPort {
  private api: Promise<BrainApi> | undefined;
  constructor(private readonly connect: () => Promise<BrainApi>) {}
  async call(call: BridgeRemoteToolCall) {
    this.api ??= this.connect().catch((error: unknown) => {
      this.api = undefined;
      throw error;
    });
    return await new BrainApiBridgeAdapter(await this.api).call(call);
  }
}

export class LazyHubApiBridgeAdapter implements BridgeRemoteToolPort {
  private apis: Promise<HubBridgeApis> | undefined;
  constructor(private readonly connect: () => Promise<HubBridgeApis>) {}
  async call(call: BridgeRemoteToolCall) {
    this.apis ??= this.connect().catch((error: unknown) => {
      this.apis = undefined;
      throw error;
    });
    return await new HubApiBridgeAdapter(await this.apis).call(call);
  }
}

async function dispatchBrain(api: BrainApi, call: BridgeRemoteBrainCall): Promise<unknown> {
  if (call.name === "brain_search") return await api.search(parseBrainMcpSearch(call.arguments));
  if (call.name === "brain_read") return await api.read(parseBrainMcpRead(call.arguments).artifactId);
  if (call.name === "brain_capture") {
    const { requestId, ...input } = parseBrainMcpCapture(call.arguments);
    return await api.capture(requestId, input);
  }
  if (call.name === "brain_update") {
    const { requestId, artifactId, ...input } = parseBrainMcpUpdate(call.arguments);
    return await api.update(requestId, artifactId, input);
  }
  const { requestId, sourceArtifactId, ...input } = parseBrainMcpLink(call.arguments);
  return await api.link(requestId, sourceArtifactId, input);
}

async function dispatchRegistry(api: RegistryMutationApi & RegistryReadApi, call: BridgeRemoteSkillCall): Promise<unknown> {
  if (call.name === "skill_releases") {
    const { limit } = parseRegistryMcpReleases(call.arguments);
    return await api.listStableReleases(limit);
  }
  if (call.name === "skill_read") {
    return await api.readStableRelease(parseRegistryMcpRead(call.arguments).releaseId);
  }
  if (call.name === "skill_propose") {
    const { requestId, ...input } = parseRegistryMcpPropose(call.arguments);
    return await api.propose(requestId, input);
  }
  const input = parseRegistryMcpPublish(call.arguments);
  return await api.publish(input.requestId, input.candidateId, input.version);
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value
  };
}

function isBrainCall(call: BridgeRemoteToolCall): call is BridgeRemoteBrainCall {
  return call.name.startsWith("brain_");
}
