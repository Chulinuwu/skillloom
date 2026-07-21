import type { IncomingMessage, ServerResponse } from "node:http";
import { brainHttpErrorResponse, BrainHttpError } from "./errors.js";
import { maximumBrainHttpBodyBytes } from "./schema.js";
import type { BrainHttpListenerDependencies, BrainHttpRequestListener, BrainHttpResponse } from "./types.js";

export function createBrainHttpRequestListener(dependencies: BrainHttpListenerDependencies): BrainHttpRequestListener {
  return async (request, response) => {
    try {
      const authorization = await dependencies.authorize(request);
      const body = await readBody(request);
      writeResponse(response, await dependencies.router.handle({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        ...(body.byteLength === 0 ? {} : { body })
      }, authorization));
    } catch (error) {
      writeResponse(response, brainHttpErrorResponse(error));
    }
  };
}

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBrainHttpBodyBytes()) {
      throw new BrainHttpError(413, "BRAIN_HTTP_BODY_TOO_LARGE", `JSON body exceeds ${maximumBrainHttpBodyBytes()} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function writeResponse(response: ServerResponse, result: BrainHttpResponse): void {
  const body = JSON.stringify(result.body);
  response.writeHead(result.status, { ...result.headers, "content-length": Buffer.byteLength(body).toString() });
  response.end(body);
}
