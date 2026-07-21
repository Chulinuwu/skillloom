import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "../../files/atomic-write.js";
import { hubClientLayout } from "./layout.js";
import { ensurePrivateDirectory } from "./permissions.js";
import { createDefaultHubSyncState, parseHubEndpoint, parseHubSyncState, parseHubTrust } from "./schema.js";
import type { HubEndpointCache, HubSyncState, HubTrustAnchor } from "./types.js";

export async function readHubTrust(root: string): Promise<HubTrustAnchor | null> {
  return await readOptionalJson(hubClientLayout(root).trust, parseHubTrust);
}

export async function writeHubTrust(root: string, trust: HubTrustAnchor): Promise<void> {
  await writeState(root, hubClientLayout(root).trust, parseHubTrust(trust));
}

export async function readHubEndpoint(root: string): Promise<HubEndpointCache | null> {
  return await readOptionalJson(hubClientLayout(root).endpoint, parseHubEndpoint);
}

export async function writeHubEndpoint(root: string, endpoint: HubEndpointCache): Promise<void> {
  await writeState(root, hubClientLayout(root).endpoint, parseHubEndpoint(endpoint));
}

export async function readHubSyncState(root: string): Promise<HubSyncState> {
  return await readOptionalJson(hubClientLayout(root).sync, parseHubSyncState) ?? createDefaultHubSyncState();
}

export async function writeHubSyncState(root: string, sync: HubSyncState): Promise<void> {
  await writeState(root, hubClientLayout(root).sync, parseHubSyncState(sync));
}

async function writeState(root: string, path: string, value: unknown): Promise<void> {
  await ensurePrivateDirectory(hubClientLayout(root).root);
  await atomicWriteJson(path, value, { mode: 0o600 });
}
async function readOptionalJson<T>(path: string, parse: (value: unknown) => T): Promise<T | null> {
  try {
    return parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
