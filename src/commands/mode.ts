import type { Command } from "../domain/types.js";
import { ensureConfig, setMode } from "../config/service.js";

export async function modeCommand(command: Extract<Command, { command: "mode" }>, projectRoot = process.cwd()) {
  return command.mode ? await setMode(projectRoot, command.mode) : await ensureConfig(projectRoot);
}
