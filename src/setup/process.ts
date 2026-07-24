import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import {
  defaultExecutableFallbacks,
  defaultExecutableRuntime,
  executableCandidates,
  prepareProcessInvocation,
  type ExecutableFallbacks,
  type ExecutableRuntime
} from "./executable-resolution.js";
import type { ProcessPort } from "./types.js";

const execute = promisify(execFile);

export class SystemProcessPort implements ProcessPort {
  private readonly runtime: ExecutableRuntime;
  private readonly fallbacks: ExecutableFallbacks;

  constructor(
    private readonly searchPath = process.env.PATH ?? "",
    fallbacks?: ExecutableFallbacks,
    runtime: ExecutableRuntime = defaultExecutableRuntime()
  ) {
    this.runtime = runtime;
    this.fallbacks = fallbacks ?? defaultExecutableFallbacks(runtime);
  }

  async findExecutable(name: string): Promise<string | null> {
    for (const path of executableCandidates(name, this.searchPath, this.fallbacks, this.runtime)) {
      try {
        await access(path, this.runtime.platform === "win32" ? constants.F_OK : constants.X_OK);
        return path;
      } catch {
      }
    }
    return null;
  }

  async run(executable: string, args: string[], environment?: NodeJS.ProcessEnv, timeoutMs?: number) {
    const invocation = prepareProcessInvocation(executable, args, this.runtime);
    try {
      const { stdout, stderr } = await execute(invocation.executable, invocation.args, {
        shell: false,
        windowsHide: true,
        ...(environment ? { env: environment } : {}),
        ...(timeoutMs === undefined ? {} : { timeout: timeoutMs })
      });
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      if (typeof error === "object" && error !== null) {
        const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
        const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
        if ("code" in error && typeof error.code === "number") return { exitCode: error.code, stdout, stderr };
        if ("killed" in error && error.killed === true) return { exitCode: 124, stdout, stderr };
      }
      throw error;
    }
  }
}
