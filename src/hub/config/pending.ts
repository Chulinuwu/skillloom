import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteJson } from "../../files/atomic-write.js";
import { syncDirectory } from "../../files/durability.js";
import { HUB_CLIENT_STATE_VERSION } from "./constants.js";
import { HubPendingAcknowledgementError, HubStateValidationError } from "./errors.js";
import { hubClientLayout } from "./layout.js";
import { parseHubMutationAcknowledgement, parsePendingHubMutation } from "./schema.js";
import { ensurePrivateDirectory } from "./permissions.js";
import type { PendingHubMutation, PendingHubMutationInput } from "./types.js";

export async function enqueuePendingMutation(root: string, input: PendingHubMutationInput): Promise<PendingHubMutation> {
  const pending = parsePendingHubMutation({
    ...input,
    version: HUB_CLIENT_STATE_VERSION,
    bodyHash: digest(input.body)
  });
  const layout = hubClientLayout(root);
  const directory = layout.pending;
  await ensurePrivateDirectory(layout.root);
  await ensurePrivateDirectory(directory);
  const path = pendingPath(directory, pending.requestId);
  const existing = await readOptionalPending(path);
  if (existing) {
    if (existing.bodyHash !== pending.bodyHash || existing.method !== pending.method || existing.path !== pending.path) {
      throw new HubStateValidationError(`Pending request ${pending.requestId} cannot be reused for a different mutation`);
    }
    return existing;
  }
  await atomicWriteJson(path, pending, { mode: 0o600 });
  return pending;
}

export async function readHubPendingMutations(root: string): Promise<PendingHubMutation[]> {
  const directory = hubClientLayout(root).pending;
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return await Promise.all(names.map(async (name) => parsePendingHubMutation(JSON.parse(await readFile(join(directory, name), "utf8")))));
}

export async function acknowledgePendingMutation(root: string, requestId: string, acknowledgement: unknown): Promise<void> {
  const parsedAcknowledgement = parseHubMutationAcknowledgement(acknowledgement);
  if (parsedAcknowledgement.requestId !== requestId) {
    throw new HubPendingAcknowledgementError("Hub acknowledgement does not match the pending request");
  }
  const directory = hubClientLayout(root).pending;
  const pending = await readOptionalPending(pendingPath(directory, requestId));
  if (!pending) throw new HubPendingAcknowledgementError(`Pending request ${requestId} does not exist`);
  await rm(pendingPath(directory, requestId));
  await syncDirectory(directory);
}

function pendingPath(directory: string, requestId: string): string {
  return join(directory, `${createHash("sha256").update(requestId).digest("hex")}.json`);
}

function digest(body: string): string {
  return `sha256:${createHash("sha256").update(body).digest("base64url")}`;
}

async function readOptionalPending(path: string): Promise<PendingHubMutation | null> {
  try {
    return parsePendingHubMutation(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
