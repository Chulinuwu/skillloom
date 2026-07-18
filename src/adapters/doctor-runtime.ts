import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { DoctorCheck, RuntimeTargetName } from "../domain/types.js";

export async function checkRuntime(
  target: RuntimeTargetName,
  executable: string,
  displayName: string,
  searchPath: string
): Promise<DoctorCheck> {
  for (const directory of searchPath.split(delimiter).filter(Boolean)) {
    const executablePath = join(directory, executable);
    try {
      const executableStat = await stat(executablePath);
      if (!executableStat.isFile()) {
        continue;
      }
      await access(executablePath, constants.X_OK);
      return {
        kind: "runtime",
        target,
        executable,
        path: executablePath,
        status: "ok",
        message: `${displayName} CLI is executable`
      };
    } catch {
    }
  }
  return {
    kind: "runtime",
    target,
    executable,
    status: "warning",
    message: `${displayName} CLI was not found on PATH`,
    remediation: `Install ${displayName} and ensure '${executable}' is executable on PATH.`
  };
}
