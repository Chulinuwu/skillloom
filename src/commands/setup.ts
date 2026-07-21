import type { Command } from "../domain/types.js";
import { createDefaultSetupService } from "../setup/defaults.js";
import type { SetupServicePort } from "../setup/types.js";

export async function setupCommand(
  command: Extract<Command, { command: "setup" }>,
  service?: SetupServicePort
) {
  const setup = service ?? await createDefaultSetupService(command.scope);
  return await setup.setup({
    target: command.target,
    hub: command.hub,
    scope: command.scope,
    yes: command.yes
  });
}
