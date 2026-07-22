import type { Command } from "../domain/types.js";
import { runLearningConsolidation } from "../learning/consolidation.js";

export async function consolidateLearningCommand(
  _command: Extract<Command, { command: "consolidate-learning" }>,
  projectRoot = process.cwd()
) {
  return await runLearningConsolidation(projectRoot);
}
