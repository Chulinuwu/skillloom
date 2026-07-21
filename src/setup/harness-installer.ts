import type {
  HarnessInstallerPort,
  HarnessInstallRequest,
  HarnessInstallResult,
  PortableSkillInstallerPort,
  ProcessPort,
  ProcessResult,
  SetupHarnessTarget
} from "./types.js";

const EXECUTABLES = { claude: "claude", codex: "codex" } as const;
const MARKETPLACE = "skillloom-dev";
const PLUGIN = `skillloom@${MARKETPLACE}`;

export class HarnessInstaller implements HarnessInstallerPort {
  constructor(
    private readonly processes: ProcessPort,
    private readonly portable?: PortableSkillInstallerPort
  ) {}

  async detect(target: SetupHarnessTarget): Promise<boolean> {
    if (target === "agents") return true;
    return await this.processes.findExecutable(EXECUTABLES[target]) !== null;
  }

  async install(request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    if (request.target === "agents") return await this.installPortable(request);
    const executable = await this.processes.findExecutable(EXECUTABLES[request.target]);
    if (!executable) {
      return { target: request.target, status: "not-detected", message: "Harness was not detected" };
    }
    return request.target === "claude"
      ? await this.installClaude(executable, request)
      : await this.installCodex(executable, request);
  }

  private async installClaude(executable: string, request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    const registered = await this.processes.run(executable, [
      "plugin", "marketplace", "add", request.packageRoot, "--scope", request.scope
    ]);
    if (registered.exitCode !== 0) return failure(request.target, "marketplace registration", registered);

    const inventory = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin inventory", inventory);
    const state = claudePluginState(inventory.stdout, request.scope);
    if (state === "enabled") {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }

    const action = state === "disabled" ? "enable" : "install";
    const installed = await this.processes.run(executable, ["plugin", action, PLUGIN, "--scope", request.scope]);
    if (installed.exitCode !== 0) return failure(request.target, `plugin ${action}`, installed);
    return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
  }

  private async installCodex(executable: string, request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    if (request.scope === "project") {
      return {
        target: request.target,
        status: "failed",
        message: "Codex plugins support user scope only; use --scope user or --target agents --scope project"
      };
    }
    const registered = await this.processes.run(executable, [
      "plugin", "marketplace", "add", request.packageRoot, "--json"
    ]);
    if (registered.exitCode !== 0) return failure(request.target, "marketplace registration", registered);

    const inventory = await this.processes.run(executable, [
      "plugin", "list", "--marketplace", MARKETPLACE, "--available", "--json"
    ]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin inventory", inventory);
    if (codexPluginInstalled(inventory.stdout)) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }

    const installed = await this.processes.run(executable, ["plugin", "add", PLUGIN, "--json"]);
    if (installed.exitCode !== 0) return failure(request.target, "plugin installation", installed);
    return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
  }

  private async installPortable(request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    if (!this.portable) {
      return { target: request.target, status: "failed", message: "Portable Agent Skills installer is unavailable" };
    }
    const status = await this.portable.install(request.packageRoot, request.destinationRoot);
    return {
      target: request.target,
      status,
      message: status === "installed" ? "Portable Agent Skills installed" : "Portable Agent Skills are already installed"
    };
  }
}

function claudePluginState(output: string, scope: HarnessInstallRequest["scope"]): "missing" | "disabled" | "enabled" {
  const value: unknown = JSON.parse(output);
  if (!Array.isArray(value)) throw new Error("Claude plugin inventory returned an invalid response");
  const plugin = value.find((item) => isRecord(item) && item.id === PLUGIN && item.scope === scope);
  if (!isRecord(plugin)) return "missing";
  return plugin.enabled === false ? "disabled" : "enabled";
}

function codexPluginInstalled(output: string): boolean {
  const value: unknown = JSON.parse(output);
  if (!isRecord(value) || !Array.isArray(value.installed)) {
    throw new Error("Codex plugin inventory returned an invalid response");
  }
  return value.installed.some((item) => isRecord(item) && item.pluginId === PLUGIN && item.installed === true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function failure(target: SetupHarnessTarget, step: string, result: ProcessResult): HarnessInstallResult {
  const detail = result.stderr.trim() || result.stdout.trim() || `exited with ${result.exitCode}`;
  return { target, status: "failed", message: `${step} failed: ${detail}` };
}
