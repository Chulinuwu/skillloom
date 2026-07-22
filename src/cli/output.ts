import type { ModeProfile } from "../config/mode-profile.js";
import type { DoctorReport } from "../domain/types.js";

export function formatOutput(value: unknown, json: boolean): string {
  if (json) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (isCandidate(value)) {
    return `${value.candidateId} ${value.state} ${value.metadata.name}\n`;
  }
  if (isSetupResult(value)) {
    const hub = value.hub.mode === "connected" ? value.hub.endpoint : "local-only";
    const surfaces = formatSurfaces(value.surfaces);
    const plan = value.plan ? [
      `role: ${value.plan.role} (${value.plan.status})`,
      ...value.plan.sources.map((source) => `source: ${source.title} ${source.url ?? source.kind} ${source.contentHash}`),
      ...value.plan.sources.flatMap((source) => source.snippets.map((snippet) => `evidence: ${source.title}: ${redactSetupText(snippet)}`)),
      ...value.plan.steps.map((step) => `${step.action}: ${step.title}${step.command ? ` [${step.command}]` : ""}${step.sourceTitles?.length ? ` source=${step.sourceTitles.join(",")}` : ""}`),
      ...value.plan.warnings.map((warning) => `warning: ${warning}`)
    ] : [];
    const host = value.host ? [`host: ${value.host.status}`, `policy: ${value.host.policyPath}`, ...value.host.nextActions.map((action) => `action: ${action}`)] : [];
    return [`setup: ${hub}`, ...surfaces, ...host, ...plan, ...value.targets.map((target) => `${target.target}: ${target.status}`), ""].join("\n");
  }
  if (isHostResult(value)) {
    const surfaces = formatSurfaces(value.surfaces);
    return [`host: ${value.status}`, ...surfaces, `policy: ${value.policyPath}`, ...value.nextActions.map((action) => `action: ${action}`), ""].join("\n");
  }
  if (isConfig(value)) {
    return [`mode: ${value.mode}`, formatAutomation(value.automation), ""].join("\n");
  }
  if (isLearningEvent(value)) {
    return `${value.eventId} ${value.outcome}\n`;
  }
  if (isStatus(value)) {
    const operations = value.operations.map((operation) =>
      `operation ${operation.operationId}: ${operation.phase} (${operation.status}) action: ${operation.recoveryAction}`
    );
    const lock = value.lock.state === "unlocked" ? "lock: unlocked" : `lock: ${value.lock.state} action: ${value.lock.action}`;
    return [`mode: ${value.mode}`, formatAutomation(value.automation), `learning: ${value.learning.length}`, `candidates: ${value.candidates.length}`, `promotions: ${value.promotions.length}`, `events: ${value.events.length}`, ...operations, lock, ""].join("\n");
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
type OutputSurfaces = {
  hub: { url: string; externalPort: number };
  obsidian: {
    url: string;
    externalPort: number;
    internalPort: number;
    workspaces: {
      library: { path: string; access: string };
      authoring: { path: string; access: string };
    };
  };
};

function formatSurfaces(value: OutputSurfaces | null): string[] {
  if (value === null) return [];
  const { library, authoring } = value.obsidian.workspaces;
  return [
    `hub: ${value.hub.url} (HTTPS ${value.hub.externalPort})`,
    `obsidian: ${value.obsidian.url} (HTTPS ${value.obsidian.externalPort}, internal ${value.obsidian.internalPort}, ${library.path} ${library.access}, ${authoring.path} ${authoring.access})`
  ];
}

function isSetupResult(value: unknown): value is { hub: { mode: string; endpoint?: string }; host?: null | { status: string; policyPath: string; nextActions: string[] }; surfaces: OutputSurfaces | null; targets: Array<{ target: string; status: string }>; plan?: { role: string; status: string; sources: Array<{ title: string; kind: string; url?: string; contentHash: string; snippets: string[] }>; steps: Array<{ action: string; title: string; command?: string; sourceTitles?: string[] }>; warnings: string[] } } {
  return typeof value === "object" && value !== null && "command" in value && value.command === "setup" && "targets" in value && Array.isArray(value.targets);
}
function redactSetupText(value: string): string {
  return value.replace(/\bTS_AUTHKEY\s*=\s*\S+/gu, "TS_AUTHKEY=<redacted>").replace(/tskey-[A-Za-z0-9_-]+/gu, "tskey-<redacted>");
}
function isHostResult(value: unknown): value is { status: string; policyPath: string; surfaces: OutputSurfaces | null; nextActions: string[] } {
  return typeof value === "object" && value !== null && "command" in value && value.command === "host" && "nextActions" in value && Array.isArray(value.nextActions);
}
function isConfig(value: unknown): value is { mode: string; automation: ModeProfile } {
  return typeof value === "object" && value !== null && "mode" in value && typeof value.mode === "string" && "policy" in value && "automation" in value && isModeProfile(value.automation);
}
function isLearningEvent(value: unknown): value is { eventId: string; outcome: string } {
  return typeof value === "object" && value !== null && "eventId" in value && typeof value.eventId === "string" && "outcome" in value && typeof value.outcome === "string";
}

function isCandidate(value: unknown): value is { candidateId: string; state: string; metadata: { name: string } } {
  return typeof value === "object"
    && value !== null
    && "candidateId" in value
    && "state" in value
    && "metadata" in value
    && typeof value.metadata === "object"
    && value.metadata !== null
    && "name" in value.metadata
    && typeof value.metadata.name === "string";
}

function isStatus(value: unknown): value is {
  candidates: unknown[];
  promotions: unknown[];
  learning: unknown[];
  mode: string;
  automation: ModeProfile;
  events: unknown[];
  operations: { operationId: string; phase: string; status: string; recoveryAction: string }[];
  lock: { state: string; action?: string };
} {
  return typeof value === "object" && value !== null && "candidates" in value && "promotions" in value && "learning" in value && "mode" in value && "automation" in value && isModeProfile(value.automation) && "events" in value && "operations" in value && "lock" in value;
}

function isModeProfile(value: unknown): value is ModeProfile {
  if (typeof value !== "object" || value === null || !("reviewTrigger" in value) || !("brainCapture" in value) || !("retrieval" in value) || !("promotion" in value) || !("hostLifecycle" in value)) {
    return false;
  }
  const hosts = value.hostLifecycle;
  return (value.reviewTrigger === "manual" || value.reviewTrigger === "task-end")
    && (value.brainCapture === "manual" || value.brainCapture === "auto-curated")
    && (value.retrieval === "explicit" || value.retrieval === "auto-bounded")
    && (value.promotion === "manual" || value.promotion === "policy")
    && typeof hosts === "object"
    && hosts !== null
    && "claude" in hosts
    && "codex" in hosts
    && "agents" in hosts
    && (hosts.claude === "automatic" || hosts.claude === "invoked")
    && (hosts.codex === "automatic" || hosts.codex === "invoked")
    && (hosts.agents === "automatic" || hosts.agents === "invoked");
}

function formatAutomation(profile: ModeProfile): string {
  const hosts = Object.entries(profile.hostLifecycle).map(([host, lifecycle]) => `${host}:${lifecycle}`).join(",");
  return `automation: review=${profile.reviewTrigger} brain=${profile.brainCapture} retrieval=${profile.retrieval} promotion=${profile.promotion} hosts=${hosts}`;
}
function isPromotion(value: unknown): value is { promotionId: string; result: string; targets: unknown[] } {
  return typeof value === "object" && value !== null && "promotionId" in value && "targets" in value;
}
function isDoctorReport(value: unknown): value is DoctorReport {
  return typeof value === "object" && value !== null && "command" in value && value.command === "doctor" && "checks" in value && "summary" in value;
}
