import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { ProcessPort } from "./types.js";

const execute = promisify(execFile);
type ExecutableFallbacks = Readonly<Partial<Record<string, readonly string[]>>>;
const platformFallbacks: ExecutableFallbacks = process.platform === "darwin"
  ? { tailscale: ["/Applications/Tailscale.app/Contents/MacOS/Tailscale"] }
  : {};

export class SystemProcessPort implements ProcessPort {
  constructor(
    private readonly searchPath = process.env.PATH ?? "",
    private readonly fallbacks: ExecutableFallbacks = platformFallbacks
  ) {}

  async findExecutable(name: string): Promise<string | null> {
    const candidates = [
      ...this.searchPath.split(delimiter).filter(Boolean).map((directory) => join(directory, name)),
      ...this.fallbacks[name] ?? []
    ];
    for (const path of candidates) {
      try {
        await access(path, constants.X_OK);
        return path;
      } catch {
      }
    }
    return null;
  }

  async run(executable: string, args: string[], environment?: NodeJS.ProcessEnv, timeoutMs?: number) {
    try {
      const { stdout, stderr } = await execute(executable, args, {
        shell: false,
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
