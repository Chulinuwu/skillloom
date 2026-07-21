import { DEFAULT_HUB_SERVICE_NAME } from "./constants.js";
import { HubStateValidationError } from "./errors.js";
import { writeHubEndpoint, writeHubSyncState } from "./state.js";

export async function migrateLegacyHubState(root: string, value: unknown, migratedAt: string): Promise<void> {
  if (!isRecord(value) || value.version !== 0 || value.serviceName !== DEFAULT_HUB_SERVICE_NAME
    || typeof value.endpoint !== "string" || !Number.isSafeInteger(value.latestEventSequence)
    || typeof value.latestEventSequence !== "number" || value.latestEventSequence < 0) {
    throw new HubStateValidationError("Invalid legacy Hub state");
  }
  await writeHubEndpoint(root, {
    version: 1,
    source: "service",
    serviceName: DEFAULT_HUB_SERVICE_NAME,
    url: value.endpoint,
    verifiedAt: migratedAt
  });
  await writeHubSyncState(root, { version: 1, lastEventSequence: String(value.latestEventSequence) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
