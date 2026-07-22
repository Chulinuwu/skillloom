import type { ProcessPort, SetupEnvironment } from "./types.js";

export class SetupEnvironmentDetector {
  constructor(private readonly processes: ProcessPort) {}

  async detect(): Promise<SetupEnvironment> {
    const tailscale = await this.detectTailscale();
    const docker = await this.detectDocker();
    return { tailscale, docker };
  }

  private async detectTailscale(): Promise<SetupEnvironment["tailscale"]> {
    const executable = await this.processes.findExecutable("tailscale");
    if (!executable) return "missing";
    const status = await this.processes.run(executable, ["status", "--json"]);
    return status.exitCode === 0 ? "authenticated" : "needs-login";
  }

  private async detectDocker(): Promise<SetupEnvironment["docker"]> {
    const executable = await this.processes.findExecutable("docker");
    if (!executable) return "missing";
    const compose = await this.processes.run(executable, ["compose", "version"]);
    return compose.exitCode === 0 ? "available" : "missing";
  }
}
