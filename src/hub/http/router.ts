import type { HubAuthorizationContext, HubPermission } from "../auth/index.js";
import type { BrainService } from "../brain/index.js";
import { brainHttpErrorResponse, BrainHttpError } from "./errors.js";
import {
  parseCaptureBody,
  parseIdempotencyKey,
  parseLinkBody,
  parseSearchBody,
  parseUpdateBody,
  validateArtifactPathId
} from "./schema.js";
import type { BrainHttpRequest, BrainHttpResponse, BrainHttpRouter } from "./types.js";

const artifactRoute = /^\/v1\/brain\/([0-9a-f-]+)$/;
const linkRoute = /^\/v1\/brain\/([0-9a-f-]+)\/links$/;

export function createBrainHttpRouter(brain: BrainService): BrainHttpRouter {
  return {
    async handle(request: BrainHttpRequest, authorization: HubAuthorizationContext): Promise<BrainHttpResponse> {
      try {
        return await routeBrainRequest(brain, request, authorization);
      } catch (error) {
        return brainHttpErrorResponse(error);
      }
    }
  };
}

async function routeBrainRequest(brain: BrainService, request: BrainHttpRequest, authorization: HubAuthorizationContext): Promise<BrainHttpResponse> {
  const pathname = parsePathname(request.url);
  if (request.method === "GET" && pathname === "/healthz") return success(200, { status: "ok" });
  if (request.method === "POST" && pathname === "/v1/brain/search") {
    requirePermission(authorization, "brain:read");
    return success(200, await brain.search({ actor: actor(authorization), ...parseSearchBody(request) }));
  }
  if (request.method === "POST" && pathname === "/v1/brain/captures") {
    requirePermission(authorization, "brain:capture");
    const requestId = parseIdempotencyKey(request);
    return mutationSuccess(201, requestId, await brain.capture({ actor: actor(authorization), requestId, ...parseCaptureBody(request) }));
  }
  const linkMatch = pathname.match(linkRoute);
  if (request.method === "POST" && linkMatch) {
    requirePermission(authorization, "brain:link");
    const requestId = parseIdempotencyKey(request);
    return mutationSuccess(201, requestId, await brain.link({
      actor: actor(authorization),
      requestId,
      sourceArtifactId: validateArtifactPathId(linkMatch[1] ?? ""),
      ...parseLinkBody(request)
    }));
  }
  const artifactMatch = pathname.match(artifactRoute);
  if (request.method === "GET" && artifactMatch) {
    requirePermission(authorization, "brain:read");
    return success(200, await brain.read({ actor: actor(authorization), artifactId: validateArtifactPathId(artifactMatch[1] ?? "") }));
  }
  if (request.method === "PUT" && artifactMatch) {
    requirePermission(authorization, "brain:update");
    const requestId = parseIdempotencyKey(request);
    return mutationSuccess(200, requestId, await brain.update({
      actor: actor(authorization),
      requestId,
      artifactId: validateArtifactPathId(artifactMatch[1] ?? ""),
      ...parseUpdateBody(request)
    }));
  }
  if (knownPath(pathname)) throw new BrainHttpError(405, "BRAIN_HTTP_METHOD_NOT_ALLOWED", "HTTP method is not allowed for this path");
  throw new BrainHttpError(404, "BRAIN_HTTP_ROUTE_NOT_FOUND", "HTTP route was not found");
}

function actor(authorization: HubAuthorizationContext) {
  return { actorId: authorization.principal.actorId };
}

function requirePermission(authorization: HubAuthorizationContext, permission: HubPermission): void {
  authorization.require(permission);
}

function parsePathname(url: string): string {
  try {
    const parsed = new URL(url, "http://loopback.invalid");
    if (parsed.search.length > 0) throw new Error("query not allowed");
    return parsed.pathname;
  } catch {
    throw new BrainHttpError(400, "BRAIN_HTTP_INVALID_URL", "Request URL is invalid or contains an unsupported query");
  }
}

function knownPath(pathname: string): boolean {
  return pathname === "/healthz" || pathname === "/v1/brain/search" || pathname === "/v1/brain/captures"
    || artifactRoute.test(pathname) || linkRoute.test(pathname);
}

function success(status: number, data: unknown): BrainHttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: { data } };
}
function mutationSuccess(status: number, requestId: string, data: unknown): BrainHttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: { requestId, accepted: true, data } };
}
