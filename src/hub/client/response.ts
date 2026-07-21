import { HubProtocolError } from "../protocol/errors.js";
import { HubResponseValidationError } from "./errors.js";

export async function parseJsonResponse<T>(response: Response, maxBytes: number, parse: (value: unknown) => T): Promise<T> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new HubResponseValidationError("Hub response must use application/json");
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new HubResponseValidationError("Hub response exceeds the configured size limit");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new HubResponseValidationError("Hub response exceeds the configured size limit");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new HubResponseValidationError("Hub response is not valid JSON", { cause: error });
  }
  try {
    return parse(value);
  } catch (error) {
    if (error instanceof HubProtocolError || error instanceof HubResponseValidationError) throw error;
    throw new HubResponseValidationError("Hub response schema is invalid", { cause: error });
  }
}
