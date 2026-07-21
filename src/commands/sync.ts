import type { Command } from "../domain/types.js";
import { createDefaultSyncService } from "../setup/defaults.js";
import type { SetupServicePort } from "../setup/types.js";

export async function syncCommand(
  command: Extract<Command, { command: "sync" }>,
  service?: SetupServicePort
) {
  return await (service ?? await createDefaultSyncService()).sync(command.apply);
}
