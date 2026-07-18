import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DoctorCheck, TargetName, TargetScope } from "../domain/types.js";
import { validateSkillPackage } from "../skills/validate.js";

export async function checkDiscoveryRoot(target: TargetName, scope: TargetScope, path: string): Promise<DoctorCheck[]> {
  try {
    const rootStat = await stat(path);
    if (!rootStat.isDirectory()) {
      return [{
        kind: "discovery-root",
        target,
        scope,
        path,
        status: "warning",
        message: "Discovery root exists but is not a directory",
        remediation: "Move the conflicting path and promote the skill again."
      }];
    }
    await access(path, constants.R_OK);
  } catch (error) {
    const missing = errorCode(error) === "ENOENT";
    return [{
      kind: "discovery-root",
      target,
      scope,
      path,
      status: "warning",
      message: missing ? "Discovery root does not exist yet" : `Discovery root cannot be read: ${errorMessage(error)}`,
      remediation: missing
        ? scope === "explicit"
          ? "Promote a skill to this explicit destination to create the root."
          : `Promote a skill to ${scope} scope to create this root.`
        : "Fix directory ownership or read permissions before using this target."
    }];
  }

  const checks: DoctorCheck[] = [{
    kind: "discovery-root",
    target,
    scope,
    path,
    status: "ok",
    message: "Discovery root is readable"
  }];
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    return [{
      kind: "discovery-root",
      target,
      scope,
      path,
      status: "warning",
      message: `Discovery root cannot be enumerated: ${errorMessage(error)}`,
      remediation: "Fix directory ownership or read permissions before using this target."
    }];
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const skillPath = join(path, entry.name);
    if (!entry.isDirectory()) {
      checks.push(invalidSkillCheck(target, scope, skillPath, entry.name, "Active skill entry is not a directory"));
      continue;
    }
    try {
      const validation = await validateSkillPackage(skillPath, {
        expectedName: entry.name,
        folderNamePolicy: "match-metadata"
      });
      const findings = validation.findings;
      checks.push({
        kind: "installed-skill",
        target,
        scope,
        path: skillPath,
        skillName: entry.name,
        state: "valid",
        packageHash: validation.packageHash,
        findings,
        status: findings.length === 0 ? "ok" : "warning",
        message: findings.length === 0
          ? "Active skill package is valid"
          : `Active skill package has ${findings.length} trust finding(s)`,
        ...(findings.length === 0 ? {} : { remediation: "Review the installed skill trust findings before using it." })
      });
    } catch (error) {
      checks.push(invalidSkillCheck(target, scope, skillPath, entry.name, errorMessage(error)));
    }
  }
  return checks;
}

function invalidSkillCheck(target: TargetName, scope: TargetScope, path: string, skillName: string, error: string): DoctorCheck {
  return {
    kind: "installed-skill",
    target,
    scope,
    path,
    skillName,
    state: "invalid",
    error,
    status: "warning",
    message: "Active skill package is invalid",
    remediation: "Repair or remove this skill before relying on native discovery."
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
