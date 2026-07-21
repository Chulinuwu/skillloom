import type { HubAuthorizationContext } from "../auth/index.js";
import { registryHttpErrorResponse } from "./http-errors.js";
import {
  parseRegistryProposeBody,
  parseRegistryPublishBody,
  parseRegistryReadPath,
  type RegistryReadRequest
} from "./http-schema.js";
import { RegistryNotFoundError } from "./server-errors.js";
import type { RegistryService } from "./service.js";

export type RegistryHttpRequest = Readonly<{
  method: string;
  url: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  body?: Uint8Array;
}>;

export type RegistryHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}>;

export type RegistryHttpRouter = Readonly<{
  handle(request: RegistryHttpRequest, authorization: HubAuthorizationContext): Promise<RegistryHttpResponse>;
}>;

export function createRegistryHttpRouter(registry: RegistryService): RegistryHttpRouter {
  return {
    async handle(request, authorization) {
      try {
        if (request.method === "GET") {
          authorization.require("skill:read");
          return success(await readRegistry(registry, parseRegistryReadPath(request.url)));
        }
        if (request.method === "POST" && pathnameFor(request.url) === "/v1/registry/proposals") {
          authorization.require("skill:propose");
          const input = await parseRegistryProposeBody(request, actor(authorization));
          return mutationSuccess(201, input.requestId, await registry.propose(input));
        }
        if (request.method === "POST" && pathnameFor(request.url) === "/v1/registry/releases") {
          authorization.require("skill:publish");
          const input = parseRegistryPublishBody(request, actor(authorization));
          return mutationSuccess(201, input.requestId, await registry.publish(input));
        }
        throw new RegistryNotFoundError("registry-route");
      } catch (error) {
        return registryHttpErrorResponse(error);
      }
    }
  };
}

async function readRegistry(registry: RegistryService, request: RegistryReadRequest): Promise<unknown> {
  if (request.kind === "manifest") {
    const manifest = await registry.readManifest(request.channel);
    if (!manifest || BigInt(manifest.payload.sequence) <= BigInt(request.afterSequence)) return null;
    return manifest;
  }
  if (request.kind === "release") {
    const release = await registry.readRelease(request.releaseId);
    if (!release) throw new RegistryNotFoundError(`release:${request.releaseId}`);
    return release;
  }
  const blob = await registry.readBlob(request.packageHash);
  if (!blob) throw new RegistryNotFoundError(`blob:${request.packageHash}`);
  return blob;
}

function success(data: unknown): RegistryHttpResponse {
  return { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: { data } };
}
function mutationSuccess(status: number, requestId: string, data: unknown): RegistryHttpResponse {
  return { status, headers: { "content-type": "application/json; charset=utf-8" }, body: { requestId, accepted: true, data } };
}
function actor(authorization: HubAuthorizationContext) {
  return { actorId: authorization.principal.actorId };
}
function pathnameFor(url: string): string {
  try {
    return new URL(url, "http://loopback.invalid").pathname;
  } catch {
    return "";
  }
}
