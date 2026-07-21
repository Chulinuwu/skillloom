import { brainHttpErrorResponse, BrainHttpError, type BrainHttpRouter } from "../http/index.js";
import { maximumBrainHttpBodyBytes } from "../http/schema.js";
import { HubAuthorizationError } from "../auth/index.js";
import { authorizeTailscaleServeRequest } from "../tailscale/headers.js";
import { runWithHubAuthorizationContext } from "./auth-context.js";
import type { HubRuntimeConfig } from "./config.js";

type RuntimeIncomingRequest = AsyncIterable<Buffer | Uint8Array | string> & {
  method?: string;
  url?: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
};

type RuntimeServerResponse = {
  writeHead(statusCode: number, headers: Record<string, string>): unknown;
  end(body: string): unknown;
};

export function createHubRuntimeRequestListener(router: BrainHttpRouter, config: HubRuntimeConfig, ready: () => boolean) {
  return async (request: RuntimeIncomingRequest, response: RuntimeServerResponse): Promise<void> => {
    try {
      const method = request.method ?? "";
      const url = request.url ?? "";
      const pathname = pathnameFor(url);
      if (method === "GET" && (pathname === "/health" || pathname === "/healthz")) {
        writeResponse(response, { status: 200, body: { data: { status: "ok" } } });
        return;
      }
      if (method === "GET" && pathname === "/ready") {
        writeResponse(response, { status: ready() ? 200 : 503, body: { data: { status: ready() ? "ready" : "starting" } } });
        return;
      }
      const authorization = authorizeTailscaleServeRequest(request, { appCapability: config.appCapability });
      const body = await readBody(request);
      writeResponse(response, await runWithHubAuthorizationContext(authorization, async () => await router.handle({
        method,
        url,
        headers: request.headers,
        ...(body.byteLength === 0 ? {} : { body })
      }, authorization)));
    } catch (error) {
      writeResponse(response, error instanceof HubAuthorizationError ? unauthorized(error) : brainHttpErrorResponse(error));
    }
  };
}

async function readBody(request: RuntimeIncomingRequest): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBrainHttpBodyBytes()) throw new BrainHttpError(413, "BRAIN_HTTP_BODY_TOO_LARGE", `JSON body exceeds ${maximumBrainHttpBodyBytes()} bytes`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function writeResponse(response: RuntimeServerResponse, result: { status: number; headers?: Readonly<Record<string, string>>; body: unknown }): void {
  const body = JSON.stringify(result.body);
  response.writeHead(result.status, { "content-type": "application/json; charset=utf-8", ...result.headers, "content-length": Buffer.byteLength(body).toString() });
  response.end(body);
}

function unauthorized(error: HubAuthorizationError) {
  return {
    status: 401,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { error: { code: "HUB_UNAUTHORIZED", message: error.message } }
  };
}

function pathnameFor(url: string): string {
  try {
    return new URL(url, "http://loopback.invalid").pathname;
  } catch {
    return "";
  }
}
