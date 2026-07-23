import { UsageError } from "../domain/errors.js";
import { checkpointSetupTarget, isSetupTargetCurrent, readSetupState } from "./state.js";
import { resolveSetupSurfaces } from "./surfaces.js";
import type {
  ConsentPort,
  HarnessInstallerPort,
  HubSetupDiscovery,
  HubSetupPort,
  SetupHarnessTarget,
  SetupEnvironmentPort,
  SetupGuidancePort,
  SetupHostResult,
  SetupHostPort,
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
    private readonly options: SetupServiceOptions,
    private readonly environment?: SetupEnvironmentPort,
    private readonly guidance?: SetupGuidancePort,
    private readonly host?: SetupHostPort
  ) {}

  async setup(request: SetupRequest): Promise<SetupResult> {
    const root = this.options.root ?? this.options.stateRoot;
    const plan = await this.plan(request);
    if (plan?.role === "role-required") {
      throw new UsageError("Choose setup role: --role main-hub, --role client-node, or --role local-only with --hub local");
    }
    if (plan?.status === "blocked") {
      throw new UsageError(`Setup plan is blocked: ${plan.warnings.join(" ")}`);
    }
    if (request.role === "main-hub") {
      await this.requireMainHubConsent(request);
      const host = await this.installHost();
      const discovery = await this.hub.discover(root, host.surfaces.hub.url);
      if (discovery.mode === "local-only") {
        throw new UsageError("Main Hub started but its private HTTPS endpoint was not reachable; local integrations were not installed");
      }
      const reconciled = await this.trustAndVerifyHub(root, discovery);
      const targets = await this.installTargets(request);
      return { command: "setup", hub: discovery, host, surfaces: host.surfaces, targets, reconciled, ...(plan ? { plan } : {}) };
    }
    const discovery: HubSetupDiscovery = request.hub === "local" ? { mode: "local-only" } : await this.hub.discover(root, request.hubUrl);
    if (request.hub === "auto" && discovery.mode === "local-only") {
      throw new UsageError("Skillloom Hub was not reachable; rerun with --hub local for explicit local-only setup");
    }
    await this.requireConsent(request, discovery);
    if (discovery.mode === "connected") {
      const reconciled = await this.trustAndVerifyHub(root, discovery);
      const targets = await this.installTargets(request);
      return { command: "setup", hub: discovery, host: null, surfaces: resolveSetupSurfaces(discovery), targets, reconciled, ...(plan ? { plan } : {}) };
    }
    const targets = await this.installTargets(request);
    return { command: "setup", hub: discovery, host: null, surfaces: null, targets, reconciled: null, ...(plan ? { plan } : {}) };
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

  private async requireMainHubConsent(request: SetupRequest): Promise<void> {
    if (request.yes) return;
    if (!this.consent.interactive) {
      throw new UsageError("Non-interactive Main Hub setup requires --yes to start Docker, configure private Tailscale Serve, and install local integrations");
    }
    const accepted = await this.consent.confirm(`Start the private Docker Hub and Obsidian Web UI with a read-only Library and writable Authoring workspace, configure private Tailscale Serve, and install Skillloom for this ${request.scope}?`);
    if (!accepted) throw new UsageError("Main Hub setup declined; no host or installation changes were made");
  }

  private async installHost(): Promise<SetupHostResult & {
    status: "running";
    surfaces: NonNullable<SetupHostResult["surfaces"]>;
  }> {
    if (!this.host) throw new UsageError("Main Hub setup requires a host installer port");
    const result = await this.host.install(true);
    if (result.status !== "running" || !result.surfaces) {
      throw new UsageError("Main Hub host install did not produce running Hub and Obsidian surfaces; local integrations were not installed");
    }
    return { ...result, status: "running", surfaces: result.surfaces };
  }
  private async trustAndVerifyHub(root: string, discovery: Extract<HubSetupDiscovery, { mode: "connected" }>) {
    await this.hub.trust(root, discovery);
    await this.hub.verifyBrainRead(root);
    return await this.hub.reconcile({ root, apply: true, strictInitial: true });
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
          packageVersion: this.options.packageVersion,
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

  private async plan(request: SetupRequest) {
    if (!this.environment || !this.guidance) return undefined;
    return await this.guidance.plan(request, await this.environment.detect());
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
