import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";

import { BridgeProtocolError, protocolError } from "./errors.js";
import { createBridgeServer } from "./server.js";
import type { BridgeStdioOptions, JsonRpcResponse } from "./types.js";

export async function runBridgeStdio(options: BridgeStdioOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const diagnostics = options.diagnostics ?? process.stderr;
  const diagnose = (message: string): void => { diagnostics.write(`${message}\n`); };
  const server = createBridgeServer({
    remote: options.remote,
    ...(options.sync === undefined ? {} : { sync: options.sync }),
    ...(options.syncTimeoutMs === undefined ? {} : { syncTimeoutMs: options.syncTimeoutMs }),
    diagnose
  });
  const decoder = new StringDecoder("utf8");
  let buffered = "";

  for await (const chunk of input) {
    buffered += typeof chunk === "string" ? chunk : decoder.write(chunk);
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) await handleLine(line);
  }
  buffered += decoder.end();
  if (buffered.length > 0) await handleLine(buffered);

  async function handleLine(rawLine: string): Promise<void> {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.trim().length === 0) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      diagnose("Malformed JSON received on stdio");
      await writeResponse(protocolError(null, new BridgeProtocolError(-32700, "Parse error")));
      return;
    }
    const response = await server.handle(message);
    if (response !== undefined) await writeResponse(response);
  }

  async function writeResponse(response: JsonRpcResponse): Promise<void> {
    if (!output.write(`${JSON.stringify(response)}\n`)) await once(output, "drain");
  }
}
