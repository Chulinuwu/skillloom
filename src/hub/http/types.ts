import type { IncomingMessage, RequestListener } from "node:http";
import type { HubAuthorizationContext } from "../auth/index.js";

export type BrainHttpRequest = {
  method: string;
  url: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  body?: Uint8Array;
};

export type BrainHttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
};

export type BrainHttpRouter = {
  handle(request: BrainHttpRequest, authorization: HubAuthorizationContext): Promise<BrainHttpResponse>;
};

export type BrainHttpAuthorizationResolver = (request: IncomingMessage) => HubAuthorizationContext | Promise<HubAuthorizationContext>;

export type BrainHttpListenerDependencies = {
  router: BrainHttpRouter;
  authorize: BrainHttpAuthorizationResolver;
};

export type BrainHttpRequestListener = RequestListener;

export type BrainHttpListenOptions = {
  host?: string;
  port: number;
};
