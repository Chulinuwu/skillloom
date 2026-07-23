import { UsageError } from "../domain/errors.js";
import { localBackendsHealthy, waitForLocalBackends } from "./backend-health.js";
import { hubCapabilitiesHealthy } from "./capability-health.js";
import { ensureDockerReady } from "./docker-readiness.js";
import { loginNameFromTailscaleStatus, personalPolicyFragment } from "./policy.js";
import { prepareObsidianWorkspace } from "./obsidian-workspace.js";
import { hostPaths, hostStateExists, prepareHostState } from "./state.js";
import { surfacesFromTailscaleStatus } from "./surfaces.js";
import { configurePrivateServe, privateServeConfigured } from "./tailscale-serve.js";
import type { HostResult, HostServiceDependencies, HostServiceOptions } from "./types.js";
export class HostService {
  constructor(
    private readonly dependencies: HostServiceDependencies,
    private readonly options: HostServiceOptions
  ) {}
  async install(yes: boolean): Promise<HostResult> {
    await this.requireConsent(yes);
    const tailscaleSession = await this.requireAuthenticatedTailscale();
    const loginName = loginNameFromTailscaleStatus(tailscaleSession.status);
    if (!loginName) {
      throw new UsageError("Main Hub setup needs an authenticated Tailscale user identity; tagged or headless hosts require an explicit advanced tailnet policy");
    }
    const existingState = await hostStateExists(this.options.hostRoot);
    const paths = await prepareHostState(this.options.hostRoot, personalPolicyFragment(loginName));
    const docker = await this.requireDocker();
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    if (existingState) {
      const stopped = await this.dependencies.processes.run(docker, [...compose, "stop", "obsidian"], this.options.env);
      if (stopped.exitCode !== 0) {
        throw new Error("Docker Compose could not pause Obsidian for a safe workspace migration");
      }
      await prepareObsidianWorkspace(paths.obsidianVaultConfig);
    }
    const start = [...compose, "up", "-d", "--build", "--wait", "--wait-timeout", "180"];
    const result = await this.dependencies.processes.run(docker, start, this.options.env);
    if (result.exitCode !== 0) {
      await this.dependencies.processes.run(docker, [...compose, "down"], this.options.env);
      throw new Error("Docker Compose could not start Skillloom Hub; the containers were removed while persistent state was preserved");
    }
    await configurePrivateServe(
      this.dependencies.processes,
      tailscaleSession.executable,
      this.options.env,
      this.options.platform ?? process.platform
    );
    const installed = await this.result("install", docker, paths);
    if (installed.status !== "running") {
      throw new UsageError("Skillloom containers started, but their host-loopback backends are not reachable; persistent state was preserved for retry");
    }
    return installed;
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
    const composeRunning = ps.exitCode === 0 && ps.stdout.includes("skillloom-hub") && ps.stdout.includes("obsidian");
    const probe = this.dependencies.localBackendsHealthy ?? localBackendsHealthy;
    const backendsHealthy = composeRunning && (action === "install"
      ? await waitForLocalBackends(probe, this.dependencies.wait)
      : await probe());
    const status = !composeRunning ? "stopped" : backendsHealthy ? "running" : "degraded";
    const tailscaleExecutable = await this.dependencies.processes.findExecutable("tailscale");
    const tailscale = status === "running" && tailscaleExecutable
      ? await this.dependencies.processes.run(tailscaleExecutable, ["status", "--json"])
      : { exitCode: 1, stdout: "", stderr: "" };
    const serveReady = tailscale.exitCode === 0
      && tailscaleExecutable !== null
      && await privateServeConfigured(this.dependencies.processes, tailscaleExecutable, this.options.env);
    const surfaces = serveReady ? surfacesFromTailscaleStatus(tailscale.stdout) : null;
    const capabilitiesReady = surfaces
      ? await hubCapabilitiesHealthy(this.dependencies.processes, surfaces.hub.url, this.options.env)
      : false;
    const nextActions = status === "running"
      ? [
          ...(capabilitiesReady
            ? []
            : [`Merge the personalized grant in ${paths.policy} into the existing top-level grants array in the Tailscale admin console`]),
          "Open the printed Hub and Obsidian URLs from another device in the same tailnet",
          ...(surfaces ? [] : ["Rerun skillloom host status after Tailscale reports its MagicDNS suffix"])
        ]
      : status === "degraded"
        ? ["Inspect Docker Compose logs because the containers are running but their host-loopback backends are unreachable, then rerun skillloom host install"]
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
    await ensureDockerReady(this.dependencies.processes, docker, {
      env: this.options.env,
      platform: this.options.platform ?? process.platform,
      ...(this.dependencies.wait ? { wait: this.dependencies.wait } : {})
    });
    return docker;
  }
  private async requireAuthenticatedTailscale(): Promise<{ executable: string; status: string }> {
    const tailscale = await this.dependencies.processes.findExecutable("tailscale");
    if (!tailscale) throw new UsageError("Tailscale CLI is required on the Main Hub host; install it and sign in before rerunning setup");
    const status = await this.dependencies.processes.run(tailscale, ["status", "--json"]);
    if (status.exitCode !== 0) throw new UsageError("Main Hub setup needs a human Tailscale login on this host before Skillloom can publish private Serve URLs");
    return { executable: tailscale, status: status.stdout };
  }
  private composeFile(): string {
    return `${this.options.packageRoot}/hub/compose.yaml`;
  }
  private emptyResult(action: HostResult["action"], status: HostResult["status"], nextActions: string[]): HostResult {
    const paths = hostPaths(this.options.hostRoot);
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces: null, nextActions };
  }
}
