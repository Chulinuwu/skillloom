import type { PendingHubMutation } from "../config/types.js";

export type HubClock = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

export type HubTimeout = {
  set: (handler: () => void, milliseconds: number) => unknown;
  clear: (handle: unknown) => void;
};

export type HubRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  maxRetryAfterMs?: number;
};
export type HubRetryJitter = (delayMs: number, attempt: number) => number;

export type HubHttpClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  clock?: HubClock;
  timeout?: HubTimeout;
  retry?: HubRetryPolicy;
  jitter?: HubRetryJitter;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type HubReadRequest<T> = {
  method: "GET" | "HEAD";
  path: string;
  parse: (value: unknown) => T;
};
export type HubQueryRequest<T> = {
  method: "POST";
  path: string;
  body: string;
  parse: (value: unknown) => T;
};

export type HubMutationRequest<T> = {
  mutation: PendingHubMutation;
  replayable: boolean;
  parse: (value: unknown) => T;
};

export type HubRequest<T> = HubReadRequest<T> | HubQueryRequest<T> | HubMutationRequest<T>;

export type HubHttpClient = {
  request: <T>(request: HubRequest<T>) => Promise<T>;
};
