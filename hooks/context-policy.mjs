import { LEARNING_MIN_INTERVAL_MS } from "./context-config.mjs";

export function isMeaningfulLearningDelta(analysis, minToolCalls, lastReviewedAt, now = Date.now()) {
  if (analysis.truncated || analysis.toolCalls < minToolCalls) {
    return false;
  }
  if (lastReviewedAt && now - Date.parse(lastReviewedAt) < LEARNING_MIN_INTERVAL_MS) {
    return false;
  }
  return analysis.correctionSignals > 0
    || analysis.mutations > 0 && analysis.verifications > 0
    || analysis.research >= 2;
}
