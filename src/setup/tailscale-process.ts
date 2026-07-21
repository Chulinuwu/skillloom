import type { TailscaleStatusProcess } from "../hub/client/index.js";
import type { ProcessPort } from "./types.js";

export class TailscaleProcessAdapter implements TailscaleStatusProcess {
  constructor(private readonly processes: ProcessPort) {}

  async run(_executable: "tailscale", args: readonly ["status", "--json"]) {
    const executable = await this.processes.findExecutable("tailscale");
    if (!executable) return { exitCode: 127, stdout: "", stderr: "tailscale executable not found" };
    return await this.processes.run(executable, [...args]);
  }
}
