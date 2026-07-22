import { UsageError } from "../domain/errors.js";
import { hostPaths, hostStateExists, prepareHostState } from "./state.js";
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
    const docker = await this.requireDocker();
    const tailscale = await this.requireAuthenticatedTailscale();
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    const start = [...compose, "up", "-d", "--build", "--wait", "--wait-timeout", "180"];
    const result = await this.dependencies.processes.run(docker, start, this.options.env);
    if (result.exitCode !== 0) {
      await this.dependencies.processes.run(docker, [...compose, "down"], this.options.env);
      throw new Error("Docker Compose could not start Skillloom Hub; the containers were removed while persistent state was preserved");
    }
    await this.configureServe(tailscale);
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
    const tailscaleExecutable = await this.dependencies.processes.findExecutable("tailscale");
    const tailscale = status === "running" && tailscaleExecutable
      ? await this.dependencies.processes.run(tailscaleExecutable, ["status", "--json"])
      : { exitCode: 1, stdout: "", stderr: "" };
    const surfaces = tailscale.exitCode === 0 ? surfacesFromTailscaleStatus(tailscale.stdout) : null;
    const nextActions = status === "running"
      ? [
          `Review and apply ${paths.policy} in the Tailscale admin console`,
          "Open the printed Hub and Obsidian URLs from another device in the same tailnet",
          ...(surfaces ? [] : ["Rerun skillloom host status after Tailscale reports its MagicDNS suffix"])
        ]
      : ["Inspect Docker Compose logs and rerun skillloom host install"];
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces, nextActions };
  }
  private async requireConsent(yes: boolean): Promise<void> {
    if (yes) return;
    if (!this.dependencies.consent.interactive) throw new UsageError("Non-interactive host installation requires --yes");
    if (!await this.dependencies.consent.confirm("Install and start the private Skillloom Hub and Obsidian Web UI with a read-only Library and writable Authoring workspace?")) {
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
  private async requireAuthenticatedTailscale(): Promise<string> {
    const tailscale = await this.dependencies.processes.findExecutable("tailscale");
    if (!tailscale) throw new UsageError("Tailscale CLI is required on the Main Hub host; install it and sign in before rerunning setup");
    const status = await this.dependencies.processes.run(tailscale, ["status", "--json"]);
    if (status.exitCode !== 0) throw new UsageError("Main Hub setup needs a human Tailscale login on this host before Skillloom can publish private Serve URLs");
    return tailscale;
  }
  private async configureServe(tailscale: string): Promise<void> {
    const hub = await this.dependencies.processes.run(tailscale, ["serve", "--bg", "--https=443", "http://127.0.0.1:8787"]);
    if (hub.exitCode !== 0) throw new Error("Tailscale Serve could not publish the Skillloom Hub; Docker state was preserved for retry");
    const obsidian = await this.dependencies.processes.run(tailscale, ["serve", "--bg", "--https=8443", "http://127.0.0.1:3000"]);
    if (obsidian.exitCode !== 0) throw new Error("Tailscale Serve could not publish Obsidian; Docker state was preserved for retry");
    const status = await this.dependencies.processes.run(tailscale, ["serve", "status"]);
    if (status.exitCode !== 0 || /funnel/iu.test(status.stdout) || !status.stdout.includes("127.0.0.1:8787") || !status.stdout.includes("127.0.0.1:3000")) {
      throw new Error("Tailscale Serve verification failed; Docker state was preserved for retry");
    }
  }
  private composeFile(): string {
    return `${this.options.packageRoot}/hub/compose.yaml`;
  }
  private emptyResult(action: HostResult["action"], status: HostResult["status"], nextActions: string[]): HostResult {
    const paths = hostPaths(this.options.hostRoot);
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces: null, nextActions };
  }
}
