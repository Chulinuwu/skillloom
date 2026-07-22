import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { ProcessPort } from "./types.js";

const execute = promisify(execFile);

export class SystemProcessPort implements ProcessPort {
  constructor(private readonly searchPath = process.env.PATH ?? "") {}

  async findExecutable(name: string): Promise<string | null> {
    for (const directory of this.searchPath.split(delimiter).filter(Boolean)) {
      const path = join(directory, name);
      try {
        await access(path, constants.X_OK);
        return path;
      } catch {
      }
    }
    return null;
  }

  async run(executable: string, args: string[], environment?: NodeJS.ProcessEnv) {
    try {
      const { stdout, stderr } = await execute(executable, args, { shell: false, ...(environment ? { env: environment } : {}) });
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "number") {
        const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
        const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
        return { exitCode: error.code, stdout, stderr };
      }
      throw error;
    }
  }
}
