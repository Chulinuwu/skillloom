import type { Command } from "../domain/types.js";
import { ensureConfig, setMode } from "../config/service.js";
import { modeProfileFor } from "../config/mode-profile.js";

export async function modeCommand(command: Extract<Command, { command: "mode" }>, projectRoot = process.cwd()) {
  const config = command.mode ? await setMode(projectRoot, command.mode) : await ensureConfig(projectRoot);
  return { ...config, automation: modeProfileFor(config.mode) };
}
