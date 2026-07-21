import type { HubAuthorizationContext } from "../auth/index.js";
import type { BrainHttpRequest, BrainHttpResponse, BrainHttpRouter } from "../http/index.js";
import { HUB_PROTOCOL_VERSION, type NegotiationResponse } from "../protocol/index.js";
import type { RegistryHttpRouter } from "../registry/index.js";

export type HubRuntimeRouterOptions = Readonly<{
  hubInstanceId: string;
  releaseSigningPublicKey: string;
  latestEventSequence: () => Promise<string>;
  ready: () => boolean;
}>;

export function createHubRuntimeRouter(brain: BrainHttpRouter, registry: RegistryHttpRouter, options: HubRuntimeRouterOptions): BrainHttpRouter {
  return {
    async handle(request: BrainHttpRequest, authorization: HubAuthorizationContext): Promise<BrainHttpResponse> {
      const pathname = pathnameFor(request.url);
      if (request.method === "GET" && pathname === "/health") return json(200, { status: "ok" });
      if (request.method === "GET" && pathname === "/healthz") return json(200, { status: "ok" });
      if (request.method === "GET" && pathname === "/ready") return json(options.ready() ? 200 : 503, { status: options.ready() ? "ready" : "starting" });
      if (request.method === "GET" && pathname === "/v1/hello") return rawJson(200, await hello(authorization, options));
      if (pathname.startsWith("/v1/registry/")) return await registry.handle(request, authorization);
      return await brain.handle(request, authorization);
    }
  };
}

export function authorizationErrorResponse(error: unknown): BrainHttpResponse {
  return {
    status: 401,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { error: { code: "HUB_UNAUTHORIZED", message: error instanceof Error ? error.message : "Request is unauthorized" } }
  };
}

function pathnameFor(url: string): string {
  try {
    return new URL(url, "http://loopback.invalid").pathname;
  } catch {
    return "";
  }
}

function json(status: number, data: unknown): BrainHttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: { data } };
}

function rawJson(status: number, body: unknown): BrainHttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body };
}

async function hello(authorization: HubAuthorizationContext, options: HubRuntimeRouterOptions): Promise<NegotiationResponse> {
  return {
    protocolVersion: HUB_PROTOCOL_VERSION,
    minimumClientVersion: "0.2.1",
    hubInstanceId: options.hubInstanceId,
    tailnetIdentity: {
      actorId: authorization.principal.actorId,
      kind: authorization.principal.kind
    },
    grantedCapabilities: [...authorization.permissions],
    releaseSigningPublicKey: options.releaseSigningPublicKey,
    latestEventSequence: await options.latestEventSequence()
  };
}
