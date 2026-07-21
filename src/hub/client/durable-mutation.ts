import {
  acknowledgePendingMutation,
  enqueuePendingMutation,
  parseHubMutationAcknowledgement
} from "../config/index.js";
import type { PendingHubMutationInput } from "../config/index.js";
import type { HubHttpClient } from "./transport-types.js";

export type DurableHubMutationOptions<T> = {
  root: string;
  input: PendingHubMutationInput;
  replayable: boolean;
  client: HubHttpClient;
  parse: (value: unknown) => T;
};

export async function executeDurableHubMutation<T>(options: DurableHubMutationOptions<T>): Promise<T> {
  const pending = await enqueuePendingMutation(options.root, options.input);
  const result = await options.client.request({
    mutation: pending,
    replayable: options.replayable,
    parse: parseHubMutationAcknowledgement
  });
  const value = options.parse(result.data);
  await acknowledgePendingMutation(options.root, pending.requestId, result);
  return value;
}
