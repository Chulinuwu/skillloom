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
    const inventory = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin inventory", inventory);
    const plugin = claudePluginState(inventory.stdout, request.scope);
    if (plugin.status === "enabled" && plugin.version === request.packageVersion) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }
    if (plugin.status === "disabled") {
      const enabled = await this.processes.run(executable, ["plugin", "enable", PLUGIN, "--scope", request.scope]);
      if (enabled.exitCode !== 0) return failure(request.target, "plugin enable", enabled);
      if (plugin.version === request.packageVersion) {
        return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
      }
    }
    if (plugin.status !== "missing") {
      return await this.updateClaude(executable, request);
    }

    const registered = await this.processes.run(executable, [
      "plugin", "marketplace", "add", request.packageRoot, "--scope", request.scope
    ]);
    if (registered.exitCode !== 0) return failure(request.target, "marketplace registration", registered);
    const installed = await this.processes.run(executable, ["plugin", "install", PLUGIN, "--scope", request.scope]);
    if (installed.exitCode !== 0) return failure(request.target, "plugin install", installed);
    return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
  }
  private async updateClaude(executable: string, request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    const marketplace = await this.processes.run(executable, ["plugin", "marketplace", "update", MARKETPLACE]);
    if (marketplace.exitCode !== 0) return failure(request.target, "marketplace update", marketplace);
    const updated = await this.processes.run(executable, ["plugin", "update", PLUGIN, "--scope", request.scope]);
    if (updated.exitCode !== 0) return failure(request.target, "plugin update", updated);
    const inventory = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin verification", inventory);
    const plugin = claudePluginState(inventory.stdout, request.scope);
    if (plugin.status !== "enabled" || plugin.version !== request.packageVersion) {
      const found = plugin.status === "missing" ? "missing" : plugin.version ?? "unknown";
      return {
        target: request.target,
        status: "failed",
        message: `Plugin update did not activate Skillloom ${request.packageVersion} (found ${found})`
      };
    }
    return { target: request.target, status: "installed", message: "Skillloom plugin updated" };
  }

  private async installCodex(executable: string, request: HarnessInstallRequest): Promise<HarnessInstallResult> {
    if (request.scope === "project") {
      return {
        target: request.target,
        status: "failed",
        message: "Codex plugins support user scope only; use --scope user or --target agents --scope project"
      };
    }
    const current = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (current.exitCode !== 0) return failure(request.target, "plugin inventory", current);
    if (codexPluginInstalled(current.stdout)) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
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

type ClaudePluginState = {
  status: "missing" | "disabled" | "enabled";
  version?: string;
};
function claudePluginState(output: string, scope: HarnessInstallRequest["scope"]): ClaudePluginState {
  const value: unknown = JSON.parse(output);
  if (!Array.isArray(value)) throw new Error("Claude plugin inventory returned an invalid response");
  const plugin = value.find((item) => isRecord(item) && item.id === PLUGIN && item.scope === scope);
  if (!isRecord(plugin)) return { status: "missing" };
  return {
    status: plugin.enabled === false ? "disabled" : "enabled",
    version: typeof plugin.version === "string" ? plugin.version : undefined
  };
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
