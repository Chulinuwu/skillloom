import type { DoctorReport } from "../domain/types.js";

export function formatOutput(value: unknown, json: boolean): string {
  if (json) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (isCandidate(value)) {
    return `${value.candidateId} ${value.state} ${value.metadata.name}\n`;
  }
  if (isConfig(value)) {
    return `mode: ${value.mode}\n`;
  }
  if (isLearningEvent(value)) {
    return `${value.eventId} ${value.outcome}\n`;
  }
  if (isStatus(value)) {
    const operations = value.operations.map((operation) =>
      `operation ${operation.operationId}: ${operation.phase} (${operation.status}) action: ${operation.recoveryAction}`
    );
    const lock = value.lock.state === "unlocked" ? "lock: unlocked" : `lock: ${value.lock.state} action: ${value.lock.action}`;
    return [`mode: ${value.mode}`, `learning: ${value.learning.length}`, `candidates: ${value.candidates.length}`, `promotions: ${value.promotions.length}`, `events: ${value.events.length}`, ...operations, lock, ""].join("\n");
  }
  if (isPromotion(value)) {
    return `${value.promotionId} ${value.result} ${value.targets.length} target(s)\n`;
  }
  if (isDoctorReport(value)) {
    const checks = value.checks.flatMap((check) => {
      const subject = check.kind === "runtime"
        ? `${check.target} runtime ${check.path ?? check.executable}`
        : check.kind === "discovery-root"
          ? `${check.target} ${check.scope} discovery root ${check.path}`
          : `${check.target} ${check.scope} skill ${check.skillName} ${check.path}`;
      const hash = check.kind === "installed-skill" && check.state === "valid" ? ` hash ${check.packageHash}` : "";
      const lines = [`[${check.status}] ${subject}: ${check.message}${hash}`];
      if (check.kind === "installed-skill" && check.state === "valid") {
        lines.push(...check.findings.map((finding) =>
          `  [${finding.severity}] ${finding.ruleId} ${finding.file}:${finding.line}: ${finding.message}`
        ));
      }
      if (check.remediation) {
        lines.push(`  action: ${check.remediation}`);
      }
      return lines;
    });
    return [`doctor: ${value.summary.ok} ok, ${value.summary.warnings} warning(s)`, ...checks, ""].join("\n");
  }
  return `${JSON.stringify(value)}\n`;
}
function isConfig(value: unknown): value is { mode: string } {
  return typeof value === "object" && value !== null && "mode" in value && typeof value.mode === "string" && "policy" in value;
}
function isLearningEvent(value: unknown): value is { eventId: string; outcome: string } {
  return typeof value === "object" && value !== null && "eventId" in value && typeof value.eventId === "string" && "outcome" in value && typeof value.outcome === "string";
}

function isCandidate(value: unknown): value is { candidateId: string; state: string; metadata: { name: string } } {
  return typeof value === "object" && value !== null && "candidateId" in value;
}

function isStatus(value: unknown): value is {
  candidates: unknown[];
  promotions: unknown[];
  learning: unknown[];
  mode: string;
  events: unknown[];
  operations: { operationId: string; phase: string; status: string; recoveryAction: string }[];
  lock: { state: string; action?: string };
} {
  return typeof value === "object" && value !== null && "candidates" in value && "promotions" in value && "learning" in value && "mode" in value && "events" in value && "operations" in value && "lock" in value;
}
function isPromotion(value: unknown): value is { promotionId: string; result: string; targets: unknown[] } {
  return typeof value === "object" && value !== null && "promotionId" in value && "targets" in value;
}
function isDoctorReport(value: unknown): value is DoctorReport {
  return typeof value === "object" && value !== null && "command" in value && value.command === "doctor" && "checks" in value && "summary" in value;
}
