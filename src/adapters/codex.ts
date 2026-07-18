import { join } from "node:path";
import type { AdapterContext, Scope } from "../domain/types.js";
import type { ScopedHarnessAdapter } from "./types.js";
import { checkDiscoveryRoot, checkRuntime } from "./doctor.js";
import { resolveSkillDestination } from "./path-policy.js";

function root(context: AdapterContext, scope: Scope): string {
  return join(scope === "project" ? context.projectRoot : context.homeDir, ".agents", "skills");
}

export const codexAdapter: ScopedHarnessAdapter = {
  kind: "scoped",
  name: "codex",
  resolveDestination(context, scope, skillName) {
    return resolveSkillDestination(root(context, scope), skillName);
  },
  async doctor(context) {
    const checks = [await checkRuntime("codex", "codex", "Codex", context.executableSearchPath ?? process.env.PATH ?? "")];
    for (const scope of ["project", "user"] as const) {
      checks.push(...await checkDiscoveryRoot("codex", scope, root(context, scope)));
    }
    return checks;
  }
};
