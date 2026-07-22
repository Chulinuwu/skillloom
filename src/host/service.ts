import { UsageError } from "../domain/errors.js";
import { hostPaths, hostStateExists, prepareHostState, requiresTailscaleAuth } from "./state.js";
import { surfacesFromTailscaleStatus } from "./surfaces.js";
import type { HostResult, HostServiceDependencies, HostServiceOptions } from "./types.js";

export class HostService {
  constructor(
    private readonly dependencies: HostServiceDependencies,
    private readonly options: HostServiceOptions
  ) {}

  async install(yes: boolean): Promise<HostResult> {
    await this.requireConsent(yes);
    const paths = await prepareHostState(this.options.hostRoot, this.options.packageRoot);
    if (await requiresTailscaleAuth(paths) && !this.options.env.TS_AUTHKEY) {
      throw new UsageError("First host install requires TS_AUTHKEY in the environment; generate a tagged reusable key, export it locally, and rerun without pasting it into chat");
    }
    const docker = await this.requireDocker();
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    const start = [...compose, "up", "-d", "--build", "--wait", "--wait-timeout", "180"];
    const result = await this.dependencies.processes.run(docker, start, this.options.env);
    if (result.exitCode !== 0) {
      await this.dependencies.processes.run(docker, [...compose, "down"], withoutAuthKey(this.options.env));
      throw new Error("Docker Compose could not start Skillloom Hub; the containers were removed while persistent state was preserved");
    }
    const scrubbed = await this.dependencies.processes.run(docker, [
      "compose", "--env-file", paths.envFile, "-f", this.composeFile(),
      "up", "-d", "--force-recreate", "--wait", "--wait-timeout", "180"
    ], withoutAuthKey(this.options.env));
    if (scrubbed.exitCode !== 0) {
      await this.dependencies.processes.run(docker, [...compose, "down"], withoutAuthKey(this.options.env));
      throw new Error("Skillloom joined Tailscale but could not remove the bootstrap credential from its containers; the containers were removed and the authenticated state was preserved");
    }
    return await this.result("install", docker, paths);
  }

  async status(): Promise<HostResult> {
    if (!await hostStateExists(this.options.hostRoot)) {
      return this.emptyResult("status", "stopped", ["Run the Skillloom setup skill and choose host install"]);
    }
    const docker = await this.requireDocker();
    return await this.result("status", docker, hostPaths(this.options.hostRoot));
  }

  private async result(action: HostResult["action"], docker: string, paths: ReturnType<typeof hostPaths>): Promise<HostResult> {
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    const ps = await this.dependencies.processes.run(docker, [...compose, "ps", "--status", "running", "--services"]);
    const status = ps.exitCode === 0 && ps.stdout.includes("skillloom-hub") && ps.stdout.includes("obsidian") ? "running" : "stopped";
    const tailscale = status === "running"
      ? await this.dependencies.processes.run(docker, [...compose, "exec", "-T", "tailscale", "tailscale", "status", "--json"])
      : { exitCode: 1, stdout: "", stderr: "" };
    const surfaces = tailscale.exitCode === 0 ? surfacesFromTailscaleStatus(tailscale.stdout) : null;
    const nextActions = status === "running"
      ? [
          `Review and apply ${paths.policy} in the Tailscale admin console`,
          "Approve svc:skillloom and svc:skillloom-obsidian if the tailnet requires service approval",
          ...(surfaces ? [] : ["Rerun skillloom host status after Tailscale reports its MagicDNS suffix"])
        ]
      : ["Inspect Docker Compose logs and rerun skillloom host install"];
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces, nextActions };
  }

  private async requireConsent(yes: boolean): Promise<void> {
    if (yes) return;
    if (!this.dependencies.consent.interactive) throw new UsageError("Non-interactive host installation requires --yes");
    if (!await this.dependencies.consent.confirm("Install and start the private Skillloom Hub and read-only Obsidian Web UI with Docker?")) {
      throw new UsageError("Host installation declined; no Docker changes were made");
    }
  }

  private async requireDocker(): Promise<string> {
    const docker = await this.dependencies.processes.findExecutable("docker");
    if (!docker) throw new UsageError("Docker with Compose v2 is required to host Skillloom");
    const version = await this.dependencies.processes.run(docker, ["compose", "version"]);
    if (version.exitCode !== 0) throw new UsageError("Docker Compose v2 is required to host Skillloom");
    return docker;
  }

  private composeFile(): string {
    return `${this.options.packageRoot}/hub/compose.yaml`;
  }

  private emptyResult(action: HostResult["action"], status: HostResult["status"], nextActions: string[]): HostResult {
    const paths = hostPaths(this.options.hostRoot);
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces: null, nextActions };
  }
}

function withoutAuthKey(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, TS_AUTHKEY: "" };
}
