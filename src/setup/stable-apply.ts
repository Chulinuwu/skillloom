import { homedir } from "node:os";
import { getScopedAdapter } from "../adapters/registry.js";
import { ensureConfig } from "../config/service.js";
import type { Scope } from "../domain/types.js";
import type { LocalStableReleaseApplyPort, StableReleaseApplyInput } from "../hub/client/index.js";
import { promoteCandidate } from "../promotions/service.js";

export class StableReleaseInstaller implements LocalStableReleaseApplyPort {
  constructor(
    private readonly scope: Scope,
    private readonly homeDir = homedir()
  ) {}

  async applyStableRelease(input: StableReleaseApplyInput): Promise<void> {
    const config = await ensureConfig(input.root);
    await promoteCandidate(
      { projectRoot: input.root, homeDir: this.homeDir },
      input.candidate.candidateId,
      config.policy.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: this.scope })),
      { yes: true, acceptWarnings: config.policy.allowWarnings }
    );
  }
}
