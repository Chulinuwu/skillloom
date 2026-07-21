import { HubAuthorizationError } from "../auth/index.js";
import { RegistryValidationError } from "./errors.js";
import type { RegistryHttpResponse } from "./http-router.js";
import {
  RegistryNotFoundError,
  RegistryServerError,
  RegistryStorageCorruptionError
} from "./server-errors.js";

export function registryHttpErrorResponse(error: unknown): RegistryHttpResponse {
  const mapped = mapRegistryHttpError(error);
  return {
    status: mapped.status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { error: { code: mapped.code, message: mapped.message } }
  };
}

function mapRegistryHttpError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof HubAuthorizationError) {
    return { status: 403, code: "HUB_FORBIDDEN", message: "The authorized principal lacks permission for this operation" };
  }
  if (error instanceof RegistryNotFoundError) return { status: 404, code: "REGISTRY_NOT_FOUND", message: error.message };
  if (error instanceof RegistryValidationError) return { status: 400, code: "REGISTRY_VALIDATION_ERROR", message: error.message };
  if (error instanceof RegistryStorageCorruptionError) return { status: 500, code: "REGISTRY_STORAGE_CORRUPTION", message: "Registry storage is inconsistent" };
  if (error instanceof RegistryServerError) return { status: 400, code: error.name, message: error.message };
  return { status: 500, code: "REGISTRY_INTERNAL_ERROR", message: "Internal server error" };
}
