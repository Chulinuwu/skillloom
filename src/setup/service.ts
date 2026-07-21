import { UsageError } from "../domain/errors.js";
import { checkpointSetupTarget, isSetupTargetCurrent, readSetupState } from "./state.js";
import type {
  ConsentPort,
  HarnessInstallerPort,
  HubSetupDiscovery,
  HubSetupPort,
  SetupHarnessTarget,
  SetupRequest,
  SetupResult,
  SetupServicePort
} from "./types.js";

type SetupServiceOptions = {
  root?: string;
  stateRoot: string;
  packageRoot: string;
  packageVersion: string;
};

const AUTO_TARGETS: SetupHarnessTarget[] = ["claude", "codex", "agents"];

export class SetupService implements SetupServicePort {
  constructor(
    private readonly hub: HubSetupPort,
    private readonly installer: HarnessInstallerPort,
    private readonly consent: ConsentPort,
    private readonly options: SetupServiceOptions
  ) {}

  async setup(request: SetupRequest): Promise<SetupResult> {
    const root = this.options.root ?? this.options.stateRoot;
    const discovery: HubSetupDiscovery = request.hub === "local" ? { mode: "local-only" } : await this.hub.discover(root);
    if (request.hub === "auto" && discovery.mode === "local-only") {
      throw new UsageError("Skillloom Hub was not reachable; rerun with --hub local for explicit local-only setup");
    }
    await this.requireConsent(request, discovery);
    if (discovery.mode === "connected") {
      await this.hub.trust(root, discovery);
      await this.hub.verifyBrainRead(root);
      const reconciled = await this.hub.reconcile({ root, apply: true, strictInitial: true });
      const targets = await this.installTargets(request);
      return { command: "setup", hub: discovery, targets, reconciled };
    }
    const targets = await this.installTargets(request);
    return { command: "setup", hub: discovery, targets, reconciled: null };
  }

  async sync(apply: boolean) {
    return { command: "sync" as const, ...await this.hub.reconcile({ root: this.options.root ?? this.options.stateRoot, apply }) };
  }

  private async requireConsent(request: SetupRequest, discovery: Awaited<ReturnType<HubSetupPort["discover"]>>): Promise<void> {
    if (request.yes) return;
    if (!this.consent.interactive) {
      throw new UsageError("Non-interactive setup requires --yes to trust the discovered Hub and install local integrations");
    }
    const destination = discovery.mode === "connected" ? discovery.endpoint : "local-only mode";
    if (!await this.consent.confirm(`Trust ${destination} and install Skillloom for this ${request.scope}?`)) {
      throw new UsageError("Setup declined; no trust or installation changes were made");
    }
  }

  private async installTargets(request: SetupRequest) {
    const state = await readSetupState(this.options.stateRoot);
    const selected = request.target === "auto" ? AUTO_TARGETS : [request.target];
    const results = [];
    for (const target of selected) {
      let detected: boolean;
      try {
        detected = await this.installer.detect(target);
      } catch (error) {
        results.push({ target, status: "failed" as const, message: errorMessage(error) });
        continue;
      }
      if (!detected) {
        results.push({ target, status: "not-detected" as const, message: "Harness was not detected" });
        continue;
      }
      if (isSetupTargetCurrent(state, target, request.scope, this.options.packageVersion)) {
        results.push({ target, status: "unchanged" as const, message: "Current Skillloom package is already installed" });
        continue;
      }
      let result;
      try {
        result = await this.installer.install({
          target,
          scope: request.scope,
          packageRoot: this.options.packageRoot,
          destinationRoot: this.options.root ?? this.options.stateRoot
        });
      } catch (error) {
        result = { target, status: "failed" as const, message: errorMessage(error) };
      }
      results.push(result);
      if (result.status === "installed" || result.status === "unchanged") {
        await checkpointSetupTarget(this.options.stateRoot, state, target, request.scope, this.options.packageVersion);
      }
    }
    return results;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
