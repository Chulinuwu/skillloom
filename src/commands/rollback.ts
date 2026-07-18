import type { Command } from "../domain/types.js";
import { rollbackPromotion } from "../promotions/rollback.js";

export async function rollbackCommand(command: Extract<Command, { command: "rollback" }>, projectRoot = process.cwd()) {
  return await rollbackPromotion(projectRoot, command.promotionId, { yes: command.yes, force: command.force });
}
