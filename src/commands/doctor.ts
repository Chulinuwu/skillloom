import { homedir } from "node:os";
import type { Command, DoctorCheck, DoctorReport } from "../domain/types.js";
import { getGenericAdapter, getScopedAdapter } from "../adapters/registry.js";

export async function doctorCommand(
  command: Extract<Command, { command: "doctor" }>,
  projectRoot = process.cwd(),
  homeDir = homedir(),
  executableSearchPath = process.env.PATH ?? ""
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const context = { projectRoot, homeDir, executableSearchPath };
  if (command.targetMode === "directory") {
    checks.push(...await getGenericAdapter().doctor(context, command.destinationRoot));
  } else {
    for (const target of command.targets) {
      checks.push(...await getScopedAdapter(target).doctor(context));
    }
  }
  return {
    command: "doctor",
    checks,
    summary: {
      ok: checks.filter((check) => check.status === "ok").length,
      warnings: checks.filter((check) => check.status === "warning").length
    }
  };
}
