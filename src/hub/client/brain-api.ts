import {
  acknowledgePendingMutation,
  parseHubMutationAcknowledgement,
  readHubPendingMutations
} from "../config/index.js";
import type {
  BrainArtifact,
  BrainArtifactMutationResult,
  BrainLinkMutationResult,
  BrainSearchResult,
  CaptureBrainInput,
  LinkBrainInput,
  SearchBrainInput,
  UpdateBrainInput
} from "../brain/index.js";
import {
  parseBrainArtifact,
  parseBrainArtifactMutation,
  parseBrainDataEnvelope,
  parseBrainLinkMutation,
  parseBrainSearchResults
} from "./brain-response.js";
import { executeDurableHubMutation } from "./durable-mutation.js";
import type { HubHttpClient } from "./transport-types.js";

export type BrainApi = Readonly<{
  search(input: Omit<SearchBrainInput, "actor">): Promise<BrainSearchResult[]>;
  read(artifactId: string): Promise<BrainArtifact>;
  capture(requestId: string, input: Omit<CaptureBrainInput, "actor" | "requestId">): Promise<BrainArtifactMutationResult>;
  update(requestId: string, artifactId: string, input: Omit<UpdateBrainInput, "actor" | "requestId" | "artifactId">): Promise<BrainArtifactMutationResult>;
  link(requestId: string, sourceArtifactId: string, input: Pick<LinkBrainInput, "targetArtifactId" | "relationship">): Promise<BrainLinkMutationResult>;
}>;

export function createBrainApi(root: string, client: HubHttpClient): BrainApi {
  return {
    search: async (input) => await query(client, "/v1/brain/search", input, parseBrainSearchResults),
    read: async (artifactId) => await client.request({
      method: "GET",
      path: `/v1/brain/${encodeURIComponent(artifactId)}`,
      parse: (value) => parseBrainDataEnvelope(value, parseBrainArtifact)
    }),
    capture: async (requestId, input) => await mutate(root, client, requestId, "POST", "/v1/brain/captures", input, parseBrainArtifactMutation),
    update: async (requestId, artifactId, input) => await mutate(
      root,
      client,
      requestId,
      "PUT",
      `/v1/brain/${encodeURIComponent(artifactId)}`,
      input,
      parseBrainArtifactMutation
    ),
    link: async (requestId, sourceArtifactId, input) => await mutate(
      root,
      client,
      requestId,
      "POST",
      `/v1/brain/${encodeURIComponent(sourceArtifactId)}/links`,
      input,
      parseBrainLinkMutation
    )
  };
}

export async function drainPendingHubMutations(root: string, client: HubHttpClient): Promise<number> {
  const pending = (await readHubPendingMutations(root)).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.requestId.localeCompare(right.requestId)
  );
  let acknowledged = 0;
  for (const mutation of pending) {
    const response = await client.request({ mutation, replayable: true, parse: parseHubMutationAcknowledgement });
    await acknowledgePendingMutation(root, mutation.requestId, response);
    acknowledged += 1;
  }
  return acknowledged;
}

async function query<T>(client: HubHttpClient, path: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
  return await client.request({
    method: "POST",
    path,
    body: JSON.stringify(body),
    parse: (value) => parseBrainDataEnvelope(value, parse)
  });
}

async function mutate<T>(
  root: string,
  client: HubHttpClient,
  requestId: string,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  parse: (value: unknown) => T
): Promise<T> {
  return await executeDurableHubMutation({
    root,
    client,
    input: { requestId, method, path, body: JSON.stringify(body), createdAt: new Date().toISOString() },
    replayable: true,
    parse
  });
}
