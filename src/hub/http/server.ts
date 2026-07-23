import { createServer, type Server } from "node:http";
import type { BrainHttpListenOptions, BrainHttpRequestListener } from "./types.js";

const loopbackHosts: ReadonlySet<string> = new Set(["127.0.0.1", "::1"]);
const containerHosts: ReadonlySet<string> = new Set(["0.0.0.0"]);

export function createBrainHttpServer(listener: BrainHttpRequestListener): Server {
  return createServer(listener);
}

export function listenBrainHttpServer(server: Server, options: BrainHttpListenOptions): Promise<void> {
  const exposure = options.exposure ?? "loopback";
  const host = options.host ?? (exposure === "container" ? "0.0.0.0" : "127.0.0.1");
  const allowedHosts = exposure === "container" ? containerHosts : loopbackHosts;
  if (!allowedHosts.has(host)) throw new Error(`Brain HTTP server host ${host} is not allowed for ${exposure} exposure`);
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, host);
  });
}
