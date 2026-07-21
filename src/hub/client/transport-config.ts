import type { HubClock, HubHttpClientOptions, HubRetryJitter, HubRetryPolicy, HubTimeout } from "./transport-types.js";

export const DEFAULT_HUB_RETRY: Required<HubRetryPolicy> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
  maxRetryAfterMs: 30_000
};
export const DEFAULT_HUB_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
export const SYSTEM_HUB_JITTER: HubRetryJitter = (delayMs) => Math.floor(Math.random() * (delayMs + 1));
const MAX_HUB_RETRY_ATTEMPTS = 10;
const MAX_HUB_RETRY_DELAY_MS = 60_000;

export const SYSTEM_HUB_CLOCK: HubClock = {
  now: () => Date.now(),
  sleep: async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds))
};

let timeoutSequence = 0;
const systemTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

export const SYSTEM_HUB_TIMEOUT: HubTimeout = {
  set: (handler, milliseconds) => {
    timeoutSequence += 1;
    systemTimeouts.set(timeoutSequence, setTimeout(handler, milliseconds));
    return timeoutSequence;
  },
  clear: (handle) => {
    if (typeof handle !== "number") return;
    const timeout = systemTimeouts.get(handle);
    if (timeout !== undefined) clearTimeout(timeout);
    systemTimeouts.delete(handle);
  }
};

export function validateTransportOptions(options: HubHttpClientOptions): void {
  const retry = options.retry ?? DEFAULT_HUB_RETRY;
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > MAX_HUB_RETRY_ATTEMPTS
    || !Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0 || retry.baseDelayMs > MAX_HUB_RETRY_DELAY_MS
    || retry.maxDelayMs !== undefined && (!Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < 0 || retry.maxDelayMs > MAX_HUB_RETRY_DELAY_MS)
    || retry.maxRetryAfterMs !== undefined && (!Number.isFinite(retry.maxRetryAfterMs) || retry.maxRetryAfterMs < 0 || retry.maxRetryAfterMs > MAX_HUB_RETRY_DELAY_MS)
    || !Number.isFinite(options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS) || (options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS) <= 0
    || !Number.isSafeInteger(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES) || (options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES) < 1) {
    throw new TypeError("Invalid Hub HTTP client options");
  }
}
