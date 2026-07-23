export function sessionContext({ mode, skillName, capsule, source }) {
  const anchor = capsule.tracked === false
    ? `Temporary context capsule ${capsule.capsuleId} could not be persisted; re-read the latest goal before work.`
    : `Context capsule ${capsule.capsuleId} epoch ${capsule.epoch} is current after ${source}; keep it as an internal anchor and re-read the latest goal after refresh.`;
  const setup = "Use $setup-skillloom for setup and private Hub or Obsidian URLs.";
  if (mode === "hermes") {
    return `${setup} Skillloom is in hermes mode. ${anchor} Before work, run one bounded Brain recall; read at most 3 high-confidence results. Continue if Hub unavailable; never claim success. Automatic review needs a meaningful durable delta; $autonomous-learning stays explicit. Codex and agents require invocation.`;
  }
  if (mode === "policy") {
    return `${setup} Skillloom is in policy mode. ${anchor} Use $${skillName} for reusable workflows. Context refresh is automatic; learning stays explicit. Promotion with --policy requires deterministic project policy.`;
  }
  return `${setup} Skillloom is in manual mode. ${anchor} Use $${skillName} for reusable workflows. Context refresh is automatic; learning and promotion require explicit invocation and approval.`;
}

export function contextRefreshReason(health, capsule, mode) {
  const recall = mode === "hermes"
    ? " Run one bounded Brain recall and read at most 3 high-confidence results if the Hub is available."
    : "";
  return `Skillloom context recovery: the prior capsule was stale (${health.reason}). Capsule ${capsule.capsuleId} epoch ${capsule.epoch} is now current. Reorient from the latest user goal, active constraints, and verified workspace state.${recall} This is context refresh, not autonomous learning. Do not expose the capsule marker to the user. Continue the task, then stop again.`;
}

export function learningReviewReason() {
  return "Skillloom Hermes found a meaningful durable delta after the last learning checkpoint. A bounded local episode has been queued for background consolidation. Use $autonomous-learning now and choose exactly one bounded outcome: no-op, memory, skill-create, or skill-patch. A memory outcome searches before writing, performs at most one authenticated brain_capture, brain_update, or brain_link mutation, then records skillloom observe --outcome memory. If the Hub is unavailable, record only the local observation and do not claim a central write succeeded. Reusable procedures still require capture, validation, and skillloom promote --policy; rejected candidates stay quarantined. Never persist transcripts or credentials.";
}
