import type { Command } from "../domain/types.js";
import { listCandidates } from "../store/candidates.js";
import { listLearningEvents } from "../store/learning.js";
import { listPromotions } from "../store/promotions.js";

export async function journeyCommand(_command: Extract<Command, { command: "journey" }>, projectRoot = process.cwd()) {
  return {
    learning: await listLearningEvents(projectRoot),
    candidates: await listCandidates(projectRoot),
    promotions: await listPromotions(projectRoot)
  };
}
