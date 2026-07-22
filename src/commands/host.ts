import type { Command } from "../domain/types.js";
import { createDefaultHostService } from "../host/defaults.js";
import type { HostService } from "../host/service.js";

export async function hostCommand(command: Extract<Command, { command: "host" }>, service?: HostService) {
  const host = service ?? createDefaultHostService();
  return command.action === "install" ? await host.install(command.yes) : await host.status();
}
