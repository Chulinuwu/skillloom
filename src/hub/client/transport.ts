import { parsePendingHubMutation, validateHubUrl } from "../config/index.js";
import {
  DEFAULT_HUB_RETRY,
  DEFAULT_HUB_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BYTES,
  SYSTEM_HUB_CLOCK,
  SYSTEM_HUB_JITTER,
  SYSTEM_HUB_TIMEOUT,
  validateTransportOptions
} from "./transport-config.js";
import { HubHttpError, HubTimeoutError, HubUnavailableError } from "./errors.js";
import { parseJsonResponse } from "./response.js";
import { retryDelay } from "./retry.js";
import type { HubHttpClient, HubHttpClientOptions, HubRequest } from "./transport-types.js";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export function createHubHttpClient(options: HubHttpClientOptions): HubHttpClient {
  validateTransportOptions(options);
  const baseUrl = validateHubUrl(options.baseUrl, true);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const clock = options.clock ?? SYSTEM_HUB_CLOCK;
  const timeout = options.timeout ?? SYSTEM_HUB_TIMEOUT;
  const retry = options.retry ?? DEFAULT_HUB_RETRY;
  const jitter = options.jitter ?? SYSTEM_HUB_JITTER;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  return {
    request: async <T>(request: HubRequest<T>) => {
      const prepared = prepareRequest(request);
      for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
        let retryAfter: string | null = null;
        try {
          const response = await fetchWithTimeout(fetchImpl, new URL(prepared.path, baseUrl), prepared.init, timeoutMs, timeout);
          if (!response.ok) {
            const error = new HubHttpError(response.status);
            if (!prepared.retryable || !RETRYABLE_STATUSES.has(response.status) || attempt === retry.maxAttempts) throw error;
            retryAfter = response.headers.get("retry-after");
          } else {
            return await parseJsonResponse(response, maxResponseBytes, request.parse);
          }
        } catch (error) {
          if (error instanceof HubHttpError) {
            if (!prepared.retryable || !RETRYABLE_STATUSES.has(error.status) || attempt === retry.maxAttempts) throw error;
          } else if (!isNetworkAmbiguity(error)) {
            throw error;
          } else if (!prepared.retryable || attempt === retry.maxAttempts) {
            if (isAbort(error)) throw new HubTimeoutError(undefined, { cause: error });
            throw new HubUnavailableError(undefined, { cause: error });
          }
        }
        await clock.sleep(retryDelay(retry, retryAfter, clock.now(), attempt, jitter));
      }
      throw new HubUnavailableError();
    }
  };
}

function prepareRequest<T>(request: HubRequest<T>): { path: string; init: RequestInit; retryable: boolean } {
  if ("mutation" in request) {
    const mutation = parsePendingHubMutation(request.mutation);
    return {
      path: mutation.path,
      init: {
        method: mutation.method,
        body: mutation.body,
        headers: { "content-type": "application/json", "idempotency-key": mutation.requestId },
        redirect: "error"
      },
      retryable: request.replayable
    };
  }
  if (!isSafeRequestPath(request.path)) throw new TypeError("Hub request path is unsafe");
  if (request.method === "POST") {
    return {
      path: request.path,
      init: { method: "POST", body: request.body, headers: { "content-type": "application/json" }, redirect: "error" },
      retryable: true
    };
  }
  return { path: request.path, init: { method: request.method, redirect: "error" }, retryable: true };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  timeout: { set: (handler: () => void, milliseconds: number) => unknown; clear: (handle: unknown) => void }
): Promise<Response> {
  const controller = new AbortController();
  const handle = timeout.set(() => controller.abort(new DOMException("Hub request timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    timeout.clear(handle);
  }
}

function isSafeRequestPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("#");
}

function isNetworkAmbiguity(error: unknown): boolean {
  return error instanceof TypeError || isAbort(error);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}
