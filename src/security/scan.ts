import type { TrustFinding } from "../domain/types.js";
import { comparePackagePath } from "../files/tree.js";
import { SCANNER_RULES } from "./patterns.js";

type ScannablePackageFile = {
  relativePath: string;
  text: string;
  mode?: number;
};

export function scanSkillPackage(files: ScannablePackageFile[], declaredExecutables: ReadonlySet<string> = new Set()): TrustFinding[] {
  const findings: TrustFinding[] = [];
  for (const file of [...files].sort((left, right) => comparePackagePath(left.relativePath, right.relativePath))) {
    if (((file.mode ?? 0) & 0o111) !== 0 && !declaredExecutables.has(file.relativePath)) {
      findings.push({
        ruleId: "undeclared-executable",
        severity: "danger",
        file: file.relativePath,
        line: 1,
        message: "Executable file must be declared by its exact local path in SKILL.md"
      });
    }
    const lines = file.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const rule of SCANNER_RULES) {
        if (rule.pattern.test(line)) {
          findings.push({
            ruleId: rule.ruleId,
            severity: rule.severity,
            file: file.relativePath,
            line: index + 1,
            message: rule.message
          });
        }
      }
    }
  }
  return findings;
}
