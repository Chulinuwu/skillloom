import type { Command } from "../domain/types.js";
import { resumePromotion } from "../promotions/resume.js";

export async function resumeCommand(command: Extract<Command, { command: "resume" }>, projectRoot = process.cwd()) {
  return await resumePromotion(projectRoot, command.operationId, command.yes);
}
