import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { codexAdapter } from "../../src/adapters/codex.js";
import { promoteCandidate } from "../../src/promotions/service.js";
import { rollbackPromotion } from "../../src/promotions/rollback.js";

const [mode, root, homeDir, recordId, boundary, targetMode = "single"] = process.argv.slice(2);
const crash = (observed: string) => {
  if (observed === boundary) {
    process.kill(process.pid, "SIGKILL");
  }
};

const compensate = targetMode === "compensate";
if (mode === "promote") {
  const targets = targetMode === "multi" || compensate
    ? [{ adapter: claudeCodeAdapter, scope: "project" as const }, { adapter: codexAdapter, scope: "project" as const }]
    : [{ adapter: claudeCodeAdapter, scope: "project" as const }];
  await promoteCandidate({ projectRoot: root, homeDir }, recordId, targets, { yes: true, acceptWarnings: false }, {
    afterDurableBoundary: crash,
    beforeCommit: compensate ? (_target, index) => index === 1 ? Promise.reject(new Error("trigger compensation")) : Promise.resolve() : undefined
  });
} else if (mode === "rollback") {
  await rollbackPromotion(root, recordId, { yes: true, force: false }, {
    afterDurableBoundary: crash,
    beforeCommit: compensate ? (_destination, index) => index === 1 ? Promise.reject(new Error("trigger compensation")) : Promise.resolve() : undefined
  });
} else {
  process.exitCode = 2;
}
