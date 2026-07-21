import { HUB_PROTOCOL_VERSION, parseNegotiationResponse } from "../protocol/index.js";
import type { NegotiationResponse } from "../protocol/index.js";
import type { HubHttpClient } from "./transport-types.js";

export async function negotiateHub(client: HubHttpClient, clientVersion: string): Promise<NegotiationResponse> {
  return await client.request({
    method: "GET",
    path: "/v1/hello",
    parse: (value) => parseNegotiationResponse(value, { protocolVersion: HUB_PROTOCOL_VERSION, clientVersion })
  });
}
