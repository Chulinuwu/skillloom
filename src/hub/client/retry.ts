import { DEFAULT_HUB_RETRY } from "./transport-config.js";
import type { HubRetryJitter, HubRetryPolicy } from "./transport-types.js";

export function retryDelay(
  retry: HubRetryPolicy,
  retryAfter: string | null,
  now: number,
  attempt: number,
  jitter: HubRetryJitter
): number {
  const parsedRetryAfter = parseRetryAfter(retryAfter, now);
  const maximum = parsedRetryAfter === null
    ? retry.maxDelayMs ?? DEFAULT_HUB_RETRY.maxDelayMs
    : retry.maxRetryAfterMs ?? DEFAULT_HUB_RETRY.maxRetryAfterMs;
  const requested = parsedRetryAfter ?? exponentialDelay(retry.baseDelayMs, attempt);
  const bounded = Math.min(requested, maximum);
  const randomized = jitter(bounded, attempt);
  return Number.isFinite(randomized) ? Math.max(0, Math.min(randomized, bounded)) : bounded;
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) * 1000 : null;
  const milliseconds = seconds ?? Date.parse(value) - now;
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

function exponentialDelay(base: number, attempt: number): number {
  return base * 2 ** Math.min(attempt - 1, 52);
}
