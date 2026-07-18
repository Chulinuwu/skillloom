import { homedir } from "node:os";
import type { Command } from "../domain/types.js";
import { PromotionTransactionError } from "../domain/errors.js";
import { getGenericAdapter, getScopedAdapter } from "../adapters/registry.js";
import type { PromotionTarget } from "../promotions/types.js";
import { promoteCandidate } from "../promotions/service.js";

export async function promoteCommand(
  command: Extract<Command, { command: "promote" }>,
  projectRoot = process.cwd(),
  homeDir = homedir()
) {
  const targets: PromotionTarget[] = command.targetMode === "directory"
    ? [{ adapter: getGenericAdapter(), destinationRoot: command.destinationRoot }]
    : command.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: command.scope }));
  const result = await promoteCandidate(
    { projectRoot, homeDir },
    command.candidateId,
    targets,
    { yes: command.yes, acceptWarnings: command.acceptWarnings }
  );
  if (result.result === "compensated") {
    throw new PromotionTransactionError(`Promotion ${result.promotionId} was compensated: ${result.error}`);
  }
  return result;
}
