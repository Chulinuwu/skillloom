#!/usr/bin/env node

// src/cli/main.ts
import { realpathSync } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/domain/errors.ts
var SkillloomError = class extends Error {
  constructor(message2, code = "SKILLLOOM_ERROR", exitCode = 1) {
    super(message2);
    this.code = code;
    this.exitCode = exitCode;
  }
  code;
  exitCode;
};
var UsageError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "USAGE_ERROR", 2);
  }
};
var PathPolicyError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "PATH_POLICY_ERROR", 3);
  }
};
var ValidationError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "VALIDATION_ERROR", 4);
  }
};
var LockError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "LOCK_ERROR", 5);
  }
};
var PromotionPolicyError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "PROMOTION_POLICY_ERROR", 6);
  }
};
var PromotionTransactionError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "PROMOTION_TRANSACTION_ERROR", 7);
  }
};
var OperationInterruptedError = class extends SkillloomError {
  constructor(message2) {
    super(message2, "OPERATION_INTERRUPTED", 8);
  }
};
var JournalCorruptionError = class extends SkillloomError {
  constructor(message2, corruption, validEvents) {
    super(message2, "JOURNAL_CORRUPTION", 9);
    this.corruption = corruption;
    this.validEvents = validEvents;
  }
  corruption;
  validEvents;
};

// src/cli/learning-arguments.ts
function parseLearningArguments(command, args, output) {
  if (command === "mode") {
    const mode = args.shift();
    rejectUnknown(args);
    if (mode === void 0) {
      return { command, ...output };
    }
    if (!isMode(mode)) {
      throw new UsageError("mode must be manual, policy, or hermes");
    }
    return { command, mode, ...output };
  }
  if (command === "journey") {
    rejectUnknown(args);
    return { command, ...output };
  }
  if (command === "consolidate-learning") {
    rejectUnknown(args);
    return { command, ...output };
  }
  if (command !== "observe") {
    return void 0;
  }
  const source = takeValue(args, "--source");
  const outcome = takeValue(args, "--outcome");
  const summary = takeValue(args, "--summary");
  const candidateId = takeValue(args, "--candidate");
  const taskId = takeValue(args, "--task-id");
  const taskOutcome = takeValue(args, "--task-outcome");
  const evidence = takeValues(args, "--evidence");
  const verifier = takeValues(args, "--verifier");
  rejectUnknown(args);
  if (!isSource(source)) {
    throw new UsageError("--source must be claude, codex, or agents");
  }
  if (!isOutcome(outcome)) {
    throw new UsageError("--outcome must be no-op, memory, skill-create, or skill-patch");
  }
  if (!summary?.trim()) {
    throw new UsageError("observe requires --summary");
  }
  if (taskOutcome !== void 0 && !isTaskOutcome(taskOutcome)) {
    throw new UsageError("--task-outcome must be success, failure, cancelled, or unknown");
  }
  return {
    command,
    source,
    outcome,
    summary,
    ...candidateId ? { candidateId } : {},
    ...taskId ? { taskId } : {},
    ...taskOutcome ? { taskOutcome } : {},
    ...evidence.length > 0 ? { evidence } : {},
    ...verifier.length > 0 ? { verifier } : {},
    ...output
  };
}
function isMode(value) {
  return value === "manual" || value === "policy" || value === "hermes";
}
function isSource(value) {
  return value === "claude" || value === "codex" || value === "agents";
}
function isOutcome(value) {
  return value === "no-op" || value === "memory" || value === "skill-create" || value === "skill-patch";
}
function isTaskOutcome(value) {
  return value === "success" || value === "failure" || value === "cancelled" || value === "unknown";
}
function takeValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) {
    return void 0;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  args.splice(index, 2);
  return value;
}
function takeValues(args, flag) {
  const values = [];
  let value = takeValue(args, flag);
  while (value !== void 0) {
    values.push(value);
    value = takeValue(args, flag);
  }
  return values;
}
function rejectUnknown(args) {
  if (args.length > 0) {
    throw new UsageError(args[0].startsWith("--") ? `Unknown flag: ${args[0]}` : `Unexpected argument: ${args[0]}`);
  }
}

// src/cli/setup-arguments.ts
function parseSetupArguments(command, args, json) {
  if (command === "setup") return parseSetup(args, json);
  if (command === "sync") return parseSync(args, json);
  if (command === "bridge") return parseBridge(args, json);
  return null;
}
function parseSetup(args, json) {
  const parsed = parseOptions(args, /* @__PURE__ */ new Set(["--yes"]), /* @__PURE__ */ new Set(["--target", "--hub", "--hub-url", "--scope", "--role"]));
  const target = parsed.values.get("--target") ?? "auto";
  if (target !== "auto" && target !== "claude" && target !== "codex" && target !== "agents") {
    throw new UsageError("--target must be auto, claude, codex, or agents");
  }
  const hub = parsed.values.get("--hub") ?? "auto";
  if (!isSetupHubMode(hub)) throw new UsageError("--hub must be auto or local");
  const scope = parseScope(parsed.values.get("--scope") ?? "user");
  const hubUrl = parsed.values.get("--hub-url");
  const role = parseSetupRole(parsed.values.get("--role"));
  if (hub === "local" && hubUrl) throw new UsageError("--hub-url cannot be combined with --hub local");
  if (role === "local-only" && hub !== "local") throw new UsageError("--role local-only requires --hub local");
  if (role === "main-hub" && hubUrl) throw new UsageError("--role main-hub cannot be combined with --hub-url");
  return { command: "setup", target, hub, ...hubUrl ? { hubUrl } : {}, scope, yes: parsed.flags.has("--yes"), ...role ? { role } : {}, json };
}
function parseSync(args, json) {
  const parsed = parseOptions(args, /* @__PURE__ */ new Set(["--apply"]), /* @__PURE__ */ new Set());
  return { command: "sync", apply: parsed.flags.has("--apply"), json };
}
function parseBridge(args, json) {
  if (json) throw new UsageError("bridge does not support --json");
  const parsed = parseOptions(args, /* @__PURE__ */ new Set(["--stdio"]), /* @__PURE__ */ new Set());
  if (!parsed.flags.has("--stdio")) throw new UsageError("bridge requires --stdio");
  return { command: "bridge", stdio: true, json: false };
}
function parseOptions(args, flags, values) {
  const parsed = { flags: /* @__PURE__ */ new Set(), values: /* @__PURE__ */ new Map() };
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith("--")) throw new UsageError(`Unexpected argument: ${option}`);
    if (flags.has(option)) {
      if (parsed.flags.has(option)) throw new UsageError(`Duplicate flag: ${option}`);
      parsed.flags.add(option);
      continue;
    }
    if (!values.has(option)) throw new UsageError(`Unknown flag: ${option}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new UsageError(`${option} requires a value`);
    if (parsed.values.has(option)) throw new UsageError(`Duplicate flag: ${option}`);
    parsed.values.set(option, value);
    index += 1;
  }
  return parsed;
}
function parseScope(value) {
  if (value !== "user" && value !== "project") throw new UsageError("--scope must be user or project");
  return value;
}
function isSetupHubMode(value) {
  return value === "auto" || value === "local";
}
function parseSetupRole(value) {
  if (value === void 0) return void 0;
  if (value === "main-hub" || value === "client-node" || value === "local-only") return value;
  throw new UsageError("--role must be main-hub, client-node, or local-only");
}

// src/cli/host-arguments.ts
function parseHostArguments(command, args, json) {
  if (command !== "host") return null;
  const values = [...args];
  const action = values.shift();
  if (action !== "install" && action !== "status") throw new UsageError("host requires install or status");
  const yesIndex = values.indexOf("--yes");
  const yes = yesIndex >= 0;
  if (yes) values.splice(yesIndex, 1);
  if (action === "status" && yes) throw new UsageError("host status does not accept --yes");
  if (values.length > 0) throw new UsageError(`Unexpected argument: ${values[0]}`);
  return { command: "host", action, yes, json };
}

// src/cli/arguments.ts
function parseArguments(argv) {
  const args = [...argv];
  const json = takeFlag(args, "--json");
  const command = args.shift();
  const setupCommand2 = parseSetupArguments(command, args, json);
  if (setupCommand2) {
    return setupCommand2;
  }
  const hostCommand2 = parseHostArguments(command, args, json);
  if (hostCommand2) return hostCommand2;
  const learningCommand = parseLearningArguments(command, args, { json });
  if (learningCommand) {
    return learningCommand;
  }
  if (command === "init") {
    rejectUnknown2(args);
    return { command, root: process.cwd(), json };
  }
  if (command === "demo") {
    const keep = takeFlag(args, "--keep");
    rejectUnknown2(args);
    return { command, keep, json };
  }
  if (command === "benchmark") {
    const kind = args.shift();
    if (kind !== "retrieval") {
      throw new UsageError("benchmark requires retrieval");
    }
    const records = positiveInteger(takeValue2(args, "--records") ?? "1000", "--records");
    const iterations = positiveInteger(takeValue2(args, "--iterations") ?? "5", "--iterations");
    const keep = takeFlag(args, "--keep");
    const workspace = takeValue2(args, "--workspace");
    rejectUnknown2(args);
    return workspace ? { command, kind, records, iterations, keep, workspace, json } : { command, kind, records, iterations, keep, json };
  }
  if (command === "capture") {
    const source = args.shift();
    if (!source) {
      throw new UsageError("capture requires a source directory");
    }
    const createdBy = takeValue2(args, "--created-by") ?? "agent";
    if (createdBy !== "agent" && createdBy !== "human") {
      throw new UsageError("--created-by must be agent or human");
    }
    const evidence = takeValues2(args, "--evidence");
    const base = takeValue2(args, "--base");
    rejectUnknown2(args);
    return base ? { command, source, createdBy, evidence, base, json } : { command, source, createdBy, evidence, json };
  }
  if (command === "validate") {
    const candidateId = args.shift();
    if (!candidateId) {
      throw new UsageError("validate requires a candidate ID");
    }
    rejectUnknown2(args);
    return { command, candidateId, json };
  }
  if (command === "promote") {
    const candidateId = args.shift();
    if (!candidateId) {
      throw new UsageError("promote requires a candidate ID");
    }
    const targets = parseTargets(takeValues2(args, "--target"));
    if (targets.length === 0) {
      throw new UsageError("promote requires at least one --target");
    }
    const scopeValue = takeValue2(args, "--scope");
    const yes = takeFlag(args, "--yes");
    const policy = takeFlag(args, "--policy");
    const acceptWarnings = takeFlag(args, "--accept-warnings");
    const destinationRoot = takeValue2(args, "--destination");
    rejectUnknown2(args);
    if (yes && policy) {
      throw new UsageError("promote accepts either --yes or --policy, not both");
    }
    if (policy && acceptWarnings) {
      throw new UsageError("--accept-warnings cannot be combined with --policy");
    }
    if (targets.includes("generic")) {
      if (targets.length !== 1) {
        throw new UsageError("generic target cannot be combined with other targets");
      }
      if (!destinationRoot) {
        throw new UsageError("generic target requires --destination");
      }
      if (scopeValue) {
        throw new UsageError("generic target does not accept --scope");
      }
      return { command, targetMode: "directory", candidateId, targets: ["generic"], destinationRoot, yes, acceptWarnings, ...policy ? { policy } : {}, json };
    }
    if (destinationRoot) {
      throw new UsageError("--destination is only valid for the generic target");
    }
    return {
      command,
      targetMode: "scoped",
      candidateId,
      targets: scopedTargets(targets),
      scope: parseScope2(scopeValue ?? "project"),
      yes,
      acceptWarnings,
      ...policy ? { policy } : {},
      json
    };
  }
  if (command === "status") {
    rejectUnknown2(args);
    return { command, json };
  }
  if (command === "recover-lock") {
    const lock = args.shift();
    if (lock !== "journal") {
      throw new UsageError("recover-lock requires journal");
    }
    const yes = takeFlag(args, "--yes");
    rejectUnknown2(args);
    return { command, lock, yes, json };
  }
  if (command === "resume") {
    const operationId = args.shift();
    if (!operationId) {
      throw new UsageError("resume requires an operation ID");
    }
    const yes = takeFlag(args, "--yes");
    rejectUnknown2(args);
    return { command, operationId, yes, json };
  }
  if (command === "doctor") {
    const values = takeValues2(args, "--target");
    const targets = values.length === 0 ? ["claude", "codex"] : parseTargets(values);
    const destinationRoot = takeValue2(args, "--destination");
    rejectUnknown2(args);
    if (targets.includes("generic")) {
      if (targets.length !== 1) {
        throw new UsageError("generic target cannot be combined with other targets");
      }
      if (!destinationRoot) {
        throw new UsageError("generic target requires --destination");
      }
      return { command, targetMode: "directory", targets: ["generic"], destinationRoot, json };
    }
    if (destinationRoot) {
      throw new UsageError("--destination is only valid for the generic target");
    }
    return { command, targetMode: "scoped", targets: scopedTargets(targets), json };
  }
  if (command === "rollback") {
    const promotionId = args.shift();
    if (!promotionId) {
      throw new UsageError("rollback requires a promotion ID");
    }
    const yes = takeFlag(args, "--yes");
    const force = takeFlag(args, "--force");
    rejectUnknown2(args);
    return { command, promotionId, yes, force, json };
  }
  throw new UsageError(command ? `Unknown command: ${command}` : "Missing command");
}
function parseTargets(values) {
  const targets = splitTargets(values);
  for (const target of targets) {
    if (target !== "claude" && target !== "codex" && target !== "agents" && target !== "generic") {
      throw new UsageError(`Unknown target: ${target}`);
    }
  }
  const unique2 = new Set(targets);
  const order = ["claude", "codex", "agents", "generic"];
  return order.filter((target) => unique2.has(target));
}
function scopedTargets(targets) {
  return targets.filter((target) => target !== "generic");
}
function splitTargets(values) {
  return values.flatMap((value) => value.split(",")).map((target) => target.trim()).filter(Boolean);
}
function parseScope2(value) {
  if (value !== "project" && value !== "user") {
    throw new UsageError("--scope must be project or user");
  }
  return value;
}
function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}
function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) {
    return false;
  }
  args.splice(index, 1);
  return true;
}
function takeValue2(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) {
    return void 0;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  args.splice(index, 2);
  return value;
}
function takeValues2(args, flag) {
  const values = [];
  let value = takeValue2(args, flag);
  while (value !== void 0) {
    values.push(value);
    value = takeValue2(args, flag);
  }
  return values;
}
function rejectUnknown2(args) {
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) {
    throw new UsageError(`Unknown flag: ${unknown}`);
  }
  if (args.length > 0) {
    throw new UsageError(`Unexpected argument: ${args[0]}`);
  }
}

// src/cli/output.ts
function formatOutput(value, json) {
  if (json) {
    return `${JSON.stringify(value, null, 2)}
`;
  }
  if (isDemoResult(value)) {
    return [
      `demo: ${value.summary.passed}/${value.checks.length} checks passed`,
      ...value.checks.map((check) => `[passed] ${check.name}: ${check.evidence}`),
      `workspace: ${value.workspaceRetained ? `kept at ${value.workspace}` : "removed"}`,
      `duration: ${value.durationMs} ms`,
      ""
    ].join("\n");
  }
  if (isBenchmarkResult(value)) {
    return [
      `retrieval benchmark: ${value.records} records, ${value.iterations} iteration(s)`,
      `implementation: ${value.implementation}`,
      ...value.cases.map(
        (benchmarkCase) => `[${benchmarkCase.required ? "required" : "informational"}] ${benchmarkCase.name}: recall@5=${benchmarkCase.recallAt5} rank=${benchmarkCase.rank ?? "none"}`
      ),
      `latency: query p50=${value.metrics.queryP50Ms} ms p95=${value.metrics.queryP95Ms} ms, cold start=${value.metrics.coldStartMs} ms, ingest=${value.metrics.ingestMs} ms`,
      `run: ${value.resumed ? "resumed existing workspace" : "new workspace"}`,
      `workspace: ${value.workspaceRetained ? `kept at ${value.workspace}` : "removed"}`,
      ""
    ].join("\n");
  }
  if (isCandidate(value)) {
    return `${value.candidateId} ${value.state} ${value.metadata.name}
`;
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
    return `${value.eventId} ${value.outcome}
`;
  }
  if (isStatus(value)) {
    const operations = value.operations.map(
      (operation) => `operation ${operation.operationId}: ${operation.phase} (${operation.status}) action: ${operation.recoveryAction}`
    );
    const lock = value.lock.state === "unlocked" ? "lock: unlocked" : `lock: ${value.lock.state} action: ${value.lock.action}`;
    return [`mode: ${value.mode}`, formatAutomation(value.automation), `learning: ${value.learning.length}`, `candidates: ${value.candidates.length}`, `promotions: ${value.promotions.length}`, `events: ${value.events.length}`, ...operations, lock, ""].join("\n");
  }
  if (isPromotion(value)) {
    return `${value.promotionId} ${value.result} ${value.targets.length} target(s)
`;
  }
  if (isDoctorReport(value)) {
    const checks = value.checks.flatMap((check) => {
      const subject = check.kind === "runtime" ? `${check.target} runtime ${check.path ?? check.executable}` : check.kind === "discovery-root" ? `${check.target} ${check.scope} discovery root ${check.path}` : `${check.target} ${check.scope} skill ${check.skillName} ${check.path}`;
      const hash2 = check.kind === "installed-skill" && check.state === "valid" ? ` hash ${check.packageHash}` : "";
      const lines = [`[${check.status}] ${subject}: ${check.message}${hash2}`];
      if (check.kind === "installed-skill" && check.state === "valid") {
        lines.push(...check.findings.map(
          (finding2) => `  [${finding2.severity}] ${finding2.ruleId} ${finding2.file}:${finding2.line}: ${finding2.message}`
        ));
      }
      if (check.remediation) {
        lines.push(`  action: ${check.remediation}`);
      }
      return lines;
    });
    return [`doctor: ${value.summary.ok} ok, ${value.summary.warnings} warning(s)`, ...checks, ""].join("\n");
  }
  return `${JSON.stringify(value)}
`;
}
function formatSurfaces(value) {
  if (value === null) return [];
  const { library, dashboards, authoring } = value.obsidian.workspaces;
  return [
    `hub: ${value.hub.url} (HTTPS ${value.hub.externalPort})`,
    `obsidian: ${value.obsidian.url} (HTTPS ${value.obsidian.externalPort}, internal ${value.obsidian.internalPort}, ${library.path} ${library.access}, ${dashboards.path} ${dashboards.access}, ${authoring.path} ${authoring.access})`
  ];
}
function isSetupResult(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "setup" && "targets" in value && Array.isArray(value.targets);
}
function redactSetupText(value) {
  return value.replace(/\bTS_AUTHKEY\s*=\s*\S+/gu, "TS_AUTHKEY=<redacted>").replace(/tskey-[A-Za-z0-9_-]+/gu, "tskey-<redacted>");
}
function isHostResult(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "host" && "nextActions" in value && Array.isArray(value.nextActions);
}
function isConfig(value) {
  return typeof value === "object" && value !== null && "mode" in value && typeof value.mode === "string" && "policy" in value && "automation" in value && isModeProfile(value.automation);
}
function isLearningEvent(value) {
  return typeof value === "object" && value !== null && "eventId" in value && typeof value.eventId === "string" && "outcome" in value && typeof value.outcome === "string";
}
function isCandidate(value) {
  return typeof value === "object" && value !== null && "candidateId" in value && "state" in value && "metadata" in value && typeof value.metadata === "object" && value.metadata !== null && "name" in value.metadata && typeof value.metadata.name === "string";
}
function isStatus(value) {
  return typeof value === "object" && value !== null && "candidates" in value && "promotions" in value && "learning" in value && "mode" in value && "automation" in value && isModeProfile(value.automation) && "events" in value && "operations" in value && "lock" in value;
}
function isModeProfile(value) {
  if (typeof value !== "object" || value === null || !("reviewTrigger" in value) || !("brainCapture" in value) || !("retrieval" in value) || !("contextRefresh" in value) || !("promotion" in value) || !("hostLifecycle" in value)) {
    return false;
  }
  const hosts = value.hostLifecycle;
  return (value.reviewTrigger === "manual" || value.reviewTrigger === "meaningful-delta") && (value.brainCapture === "manual" || value.brainCapture === "auto-curated") && (value.retrieval === "explicit" || value.retrieval === "auto-bounded") && value.contextRefresh === "automatic" && (value.promotion === "manual" || value.promotion === "policy") && typeof hosts === "object" && hosts !== null && "claude" in hosts && "codex" in hosts && "agents" in hosts && (hosts.claude === "automatic" || hosts.claude === "invoked") && (hosts.codex === "automatic" || hosts.codex === "invoked") && (hosts.agents === "automatic" || hosts.agents === "invoked");
}
function formatAutomation(profile) {
  const hosts = Object.entries(profile.hostLifecycle).map(([host, lifecycle]) => `${host}:${lifecycle}`).join(",");
  return `automation: review=${profile.reviewTrigger} brain=${profile.brainCapture} retrieval=${profile.retrieval} context=${profile.contextRefresh} promotion=${profile.promotion} hosts=${hosts}`;
}
function isPromotion(value) {
  return typeof value === "object" && value !== null && "promotionId" in value && "targets" in value;
}
function isDoctorReport(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "doctor" && "checks" in value && "summary" in value;
}
function isDemoResult(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "demo" && "checks" in value && Array.isArray(value.checks);
}
function isBenchmarkResult(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "benchmark" && "kind" in value && value.kind === "retrieval";
}

// src/commands/init.ts
import { mkdir as mkdir3 } from "node:fs/promises";

// src/config/service.ts
import { mkdir, readFile } from "node:fs/promises";

// src/config/defaults.ts
var STORE_VERSION = 1;
var DEFAULT_MODE = "manual";
var DEFAULT_POLICY = {
  targets: ["claude", "codex"],
  scope: "project",
  maxFiles: 20,
  maxTotalBytes: 256 * 1024,
  allowWarnings: false,
  allowExecutables: false,
  allowedCapabilities: []
};
var DEFAULT_HERMES = { minToolCalls: 3 };
var STORE_DIR = ".skillloom";
var CONFIG_FILE = "config.json";
var EVENTS_FILE = "events.jsonl";
var CANDIDATES_DIR = "candidates";
var PROMOTIONS_DIR = "promotions";
var OPERATIONS_DIR = "operations";
var BACKUPS_DIR = "backups";
var STAGING_DIR = "staging";
var LOCK_DIR = "lock";
var JOURNAL_LOCK_DIR = "journal.lock";
var MAX_FILE_BYTES = 512 * 1024;
var MAX_TOTAL_BYTES = 2 * 1024 * 1024;
var MAX_EVIDENCE_ITEMS = 8;
var MAX_EVIDENCE_LENGTH = 160;

// src/config/schema.ts
function createDefaultConfig(createdAt) {
  return {
    version: STORE_VERSION,
    createdAt,
    mode: DEFAULT_MODE,
    policy: { ...DEFAULT_POLICY, targets: [...DEFAULT_POLICY.targets], allowedCapabilities: [...DEFAULT_POLICY.allowedCapabilities] },
    hermes: { ...DEFAULT_HERMES }
  };
}
function parseConfig(value) {
  if (!isRecord(value) || value.version !== STORE_VERSION || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
    throw new ValidationError("Invalid Skillloom config");
  }
  const defaults = createDefaultConfig(value.createdAt);
  if (value.mode === void 0 && value.policy === void 0 && value.hermes === void 0) {
    return defaults;
  }
  if (!isMode2(value.mode) || !isPolicy(value.policy) || !isHermes(value.hermes)) {
    throw new ValidationError("Invalid Skillloom config");
  }
  return { version: value.version, createdAt: value.createdAt, mode: value.mode, policy: value.policy, hermes: value.hermes };
}
function isPolicy(value) {
  return isRecord(value) && Array.isArray(value.targets) && value.targets.every(isScopedTarget) && (value.scope === "project" || value.scope === "user") && isPositiveInteger(value.maxFiles) && isPositiveInteger(value.maxTotalBytes) && typeof value.allowWarnings === "boolean" && typeof value.allowExecutables === "boolean" && (value.allowedCapabilities === void 0 || Array.isArray(value.allowedCapabilities) && value.allowedCapabilities.every(isCapability));
}
function isCapability(value) {
  return value === "filesystem-read" || value === "filesystem-write" || value === "network" || value === "shell" || value === "secrets";
}
function isHermes(value) {
  return isRecord(value) && isPositiveInteger(value.minToolCalls);
}
function isMode2(value) {
  return value === "manual" || value === "policy" || value === "hermes";
}
function isScopedTarget(value) {
  return value === "claude" || value === "codex" || value === "agents";
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/store/layout.ts
import { join } from "node:path";
function storeLayout(projectRoot) {
  const root4 = join(projectRoot, STORE_DIR);
  return {
    root: root4,
    config: join(root4, CONFIG_FILE),
    events: join(root4, EVENTS_FILE),
    learning: join(root4, "learning"),
    learningEvents: join(root4, "learning", "events"),
    learningConsolidationJobs: join(root4, "learning", "consolidation", "jobs"),
    learningConsolidationProposals: join(root4, "learning", "consolidation", "proposals"),
    learningBrainHandoffs: join(root4, "learning", "consolidation", "brain-handoffs"),
    candidates: join(root4, CANDIDATES_DIR),
    promotions: join(root4, PROMOTIONS_DIR),
    operations: join(root4, OPERATIONS_DIR),
    backups: join(root4, BACKUPS_DIR),
    staging: join(root4, STAGING_DIR),
    lock: join(root4, LOCK_DIR),
    lockInfo: join(root4, LOCK_DIR, "lock.json"),
    journalLock: join(root4, JOURNAL_LOCK_DIR)
  };
}

// src/files/atomic-write.ts
import { open as open2, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
import { randomUUID } from "node:crypto";

// src/files/durability.ts
import { open } from "node:fs/promises";
async function syncDirectory(path) {
  if (process.platform === "win32") {
    return;
  }
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = error.code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF" && code !== "EISDIR" && code !== "EPERM") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

// src/files/atomic-write.ts
async function atomicWriteFile(path, data, options = {}) {
  const tmp = join2(dirname(path), `.tmp-${process.pid}-${randomUUID()}`);
  await writeFile(tmp, data, { mode: options.mode });
  const handle = await open2(tmp, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}
async function atomicWriteJson(path, value, options = {}) {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}
`, options);
}

// src/config/service.ts
async function ensureConfig(root4) {
  const layout = storeLayout(root4);
  await mkdir(layout.root, { recursive: true });
  const existing = await readConfig(root4);
  if (existing) {
    return existing;
  }
  const config = createDefaultConfig((/* @__PURE__ */ new Date()).toISOString());
  await atomicWriteJson(layout.config, config);
  return config;
}
async function readConfig(root4) {
  try {
    return parseConfig(JSON.parse(await readFile(storeLayout(root4).config, "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function setMode(root4, mode) {
  const config = { ...await ensureConfig(root4), mode };
  await atomicWriteJson(storeLayout(root4).config, config);
  return config;
}

// src/store/journal.ts
import { mkdir as mkdir2, open as open3, readFile as readFile3, rm as rm2 } from "node:fs/promises";
import { dirname as dirname2 } from "node:path";
import { setTimeout as setTimeout2 } from "node:timers/promises";

// src/files/lock-owner.ts
import { lstat, readFile as readFile2 } from "node:fs/promises";
import { join as join3 } from "node:path";
async function writeLockOwner(lockPath, owner) {
  await atomicWriteJson(join3(lockPath, "lock.json"), owner);
}
async function readLockOwnerDiagnostic(lockPath) {
  try {
    await lstat(lockPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { state: "unlocked" };
    }
    throw error;
  }
  try {
    const value = JSON.parse(await readFile2(join3(lockPath, "lock.json"), "utf8"));
    if (!isLockOwnerBase(value)) {
      return { state: "invalid", path: lockPath, action: "Inspect invalid lock metadata" };
    }
    const stale = !processExists(value.pid);
    return {
      state: stale ? "stale" : "active",
      path: lockPath,
      pid: value.pid,
      createdAt: value.createdAt,
      operationId: optionalString(value, "operationId"),
      context: optionalString(value, "context"),
      action: stale ? "Inspect stale lock metadata and use the operation recovery command reported by status" : "Wait for the active operation to finish"
    };
  } catch (error) {
    if (errorCode(error) === "ENOENT" || error instanceof SyntaxError) {
      return { state: "invalid", path: lockPath, action: "Inspect invalid lock metadata" };
    }
    throw error;
  }
}
async function readLockToken(lockPath) {
  try {
    const value = JSON.parse(await readFile2(join3(lockPath, "lock.json"), "utf8"));
    return isLockOwnerBase(value) ? optionalString(value, "token") : void 0;
  } catch (error) {
    if (errorCode(error) === "ENOENT" || error instanceof SyntaxError) {
      return void 0;
    }
    throw error;
  }
}
function isLockOwnerBase(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "pid" in value && typeof value.pid === "number" && Number.isInteger(value.pid) && value.pid > 0 && "createdAt" in value && typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt));
}
function optionalString(value, key) {
  return typeof value[key] === "string" ? value[key] : void 0;
}
function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/store/journal.ts
var journalQueues = /* @__PURE__ */ new Map();
async function appendEvent(root4, event, afterLockAcquired) {
  return await withJournalQueue(root4, async () => appendEventUnlocked(root4, event, afterLockAcquired));
}
async function appendEventUnlocked(root4, event, afterLockAcquired) {
  const layout = storeLayout(root4);
  await mkdir2(dirname2(layout.events), { recursive: true });
  await acquireJournalLock(layout.journalLock, event.operationId, `${event.kind}:${event.phase}`);
  try {
    await afterLockAcquired?.();
    const sequence4 = await nextSequence(layout.events);
    const record = { sequence: sequence4, timestamp: (/* @__PURE__ */ new Date()).toISOString(), ...redactEvent(event) };
    const handle = await open3(layout.events, "a");
    try {
      await handle.appendFile(`${JSON.stringify(record)}
`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return record;
  } finally {
    await rm2(layout.journalLock, { recursive: true, force: true });
    await syncDirectory(dirname2(layout.journalLock));
  }
}
async function readEvents(root4) {
  return await readEventFile(storeLayout(root4).events);
}
async function inspectJournal(root4) {
  try {
    const events = await readEvents(root4);
    return { events, health: { state: "healthy", events: events.length } };
  } catch (error) {
    if (error instanceof JournalCorruptionError) {
      return {
        events: [],
        health: {
          state: error.corruption,
          validEvents: error.validEvents,
          message: error.message,
          recoveryCommand: null
        }
      };
    }
    throw error;
  }
}
async function readJournalLockDiagnostic(root4) {
  return await readLockOwnerDiagnostic(storeLayout(root4).journalLock);
}
async function readEventFile(path) {
  let text4;
  try {
    text4 = await readFile3(path, "utf8");
  } catch (error) {
    if (errorCode2(error) === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (text4.length === 0) {
    return [];
  }
  const terminated = text4.endsWith("\n");
  const lines = text4.split("\n");
  if (terminated) {
    lines.pop();
  }
  const events = [];
  for (const [index, line] of lines.entries()) {
    if (!line) {
      throw new JournalCorruptionError(`Journal is corrupt at line ${index + 1}`, "malformed", events.length);
    }
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      const trailing = index === lines.length - 1 && !terminated;
      throw new JournalCorruptionError(
        trailing ? `Journal has a truncated trailing record at line ${index + 1}` : `Journal is corrupt at line ${index + 1}`,
        trailing ? "truncated" : "malformed",
        events.length
      );
    }
    if (!isJournalEvent(value)) {
      throw new JournalCorruptionError(`Journal is corrupt at line ${index + 1}`, "malformed", events.length);
    }
    if (value.sequence !== events.length + 1) {
      throw new JournalCorruptionError(`Journal sequence mismatch at line ${index + 1}`, "sequence", events.length);
    }
    events.push(value);
  }
  if (!terminated) {
    throw new JournalCorruptionError(`Journal has a truncated trailing record at line ${lines.length}`, "truncated", Math.max(0, events.length - 1));
  }
  return events;
}
async function nextSequence(path) {
  return (await readEventFile(path)).length + 1;
}
function isJournalEvent(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "sequence" in value && typeof value.sequence === "number" && Number.isInteger(value.sequence) && value.sequence > 0 && "timestamp" in value && typeof value.timestamp === "string" && !Number.isNaN(Date.parse(value.timestamp)) && "operationId" in value && typeof value.operationId === "string" && "kind" in value && typeof value.kind === "string" && "phase" in value && typeof value.phase === "string";
}
function redactEvent(event) {
  return JSON.parse(JSON.stringify(event), (_key, value) => {
    if (typeof value === "string" && /(transcript|OPENAI_API_KEY|sk-)/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  });
}
async function withJournalQueue(root4, fn) {
  const previous = journalQueues.get(root4) ?? Promise.resolve();
  let release;
  const current = new Promise((resolveRelease) => {
    release = resolveRelease;
  });
  const queued = previous.then(() => current, () => current);
  journalQueues.set(root4, queued);
  await previous.catch(() => void 0);
  try {
    return await fn();
  } finally {
    release();
    if (journalQueues.get(root4) === queued) {
      journalQueues.delete(root4);
    }
  }
}
async function acquireJournalLock(path, operationId, context) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let acquired = false;
    try {
      await mkdir2(path);
      acquired = true;
      await writeLockOwner(path, { pid: process.pid, createdAt: (/* @__PURE__ */ new Date()).toISOString(), operationId, context });
      return;
    } catch (error) {
      if (acquired) {
        await rm2(path, { recursive: true, force: true });
      }
      if (errorCode2(error) !== "EEXIST") {
        throw error;
      }
      await setTimeout2(5);
    }
  }
  throw new LockError(`Skillloom journal is locked at ${path}`);
}
function errorCode2(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/commands/init.ts
async function initCommand(command) {
  const layout = storeLayout(command.root);
  await ensureConfig(command.root);
  await Promise.all([
    mkdir3(layout.candidates, { recursive: true }),
    mkdir3(layout.promotions, { recursive: true }),
    mkdir3(layout.operations, { recursive: true }),
    mkdir3(layout.backups, { recursive: true }),
    mkdir3(layout.staging, { recursive: true }),
    mkdir3(layout.learningEvents, { recursive: true })
  ]);
  await appendEvent(command.root, {
    operationId: `op-init-${Date.now()}`,
    kind: "init",
    phase: "completed",
    evidence: { root: command.root }
  });
  return { ok: true, root: command.root };
}

// src/commands/capture.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve as resolve4 } from "node:path";

// src/files/lock.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir4, rename as rename2, rm as rm3 } from "node:fs/promises";
import { join as join4 } from "node:path";
async function withStoreLock(root4, fn, owner = { operationId: "op-unknown", context: "store-mutation" }) {
  const layout = storeLayout(root4);
  const token = randomUUID2();
  let acquired = false;
  try {
    await mkdir4(layout.lock);
    acquired = true;
    await writeLockOwner(layout.lock, { ...owner, pid: process.pid, createdAt: (/* @__PURE__ */ new Date()).toISOString(), token });
  } catch {
    if (acquired) {
      await rm3(layout.lock, { recursive: true, force: true });
    }
    throw new LockError(`Skillloom store is locked at ${layout.lock}`);
  }
  try {
    return await fn();
  } finally {
    await releaseOwnedLock(layout.lock, token);
  }
}
async function readLockDiagnostic(root4) {
  return await readLockOwnerDiagnostic(storeLayout(root4).lock);
}
async function withRecoveryStoreLock(root4, fn, owner) {
  const diagnostic = await readLockDiagnostic(root4);
  if (diagnostic.state === "stale") {
    if (diagnostic.operationId && diagnostic.operationId !== owner.operationId) {
      throw new LockError(`Stale lock belongs to ${diagnostic.operationId}, not ${owner.operationId}`);
    }
    const layout = storeLayout(root4);
    const archive = join4(layout.root, "stale-locks");
    await mkdir4(archive, { recursive: true });
    await rename2(layout.lock, join4(archive, `${owner.operationId}-${Date.now()}`));
    await syncDirectory(layout.root);
    await syncDirectory(archive);
  } else if (diagnostic.state !== "unlocked") {
    throw new LockError(`Skillloom store is locked at ${diagnostic.path}`);
  }
  return await withStoreLock(root4, fn, owner);
}
async function releaseOwnedLock(lockPath, token) {
  if (await readLockToken(lockPath) !== token) {
    throw new LockError(`Skillloom lock ownership changed before release at ${lockPath}`);
  }
  await rm3(lockPath, { recursive: true });
}

// src/skills/validate.ts
import { readFile as readFile6 } from "node:fs/promises";
import { basename, resolve as resolve2 } from "node:path";

// src/files/tree.ts
import { lstat as lstat2, readdir, readFile as readFile4 } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
async function collectPackageFiles(root4) {
  const absoluteRoot = resolve(root4);
  const files2 = [];
  let total = 0;
  async function visit(path) {
    const stat5 = await lstat2(path);
    if (stat5.isSymbolicLink()) {
      throw new PathPolicyError(`Refusing symlink in skill package: ${toRelative(absoluteRoot, path)}`);
    }
    if (stat5.isDirectory()) {
      const entries = await readdir(path);
      for (const entry of entries.sort()) {
        await visit(resolve(path, entry));
      }
      return;
    }
    if (!stat5.isFile()) {
      throw new PathPolicyError(`Refusing non-regular file: ${toRelative(absoluteRoot, path)}`);
    }
    if (stat5.size > MAX_FILE_BYTES) {
      throw new ValidationError(`File exceeds size limit: ${toRelative(absoluteRoot, path)}`);
    }
    total += stat5.size;
    if (total > MAX_TOTAL_BYTES) {
      throw new ValidationError("Skill package exceeds total size limit");
    }
    const relativePath = toRelative(absoluteRoot, path);
    await rejectBinary(path, relativePath);
    files2.push({ absolutePath: path, relativePath, size: stat5.size, mode: stat5.mode });
  }
  await visit(absoluteRoot);
  return files2.sort((left, right) => comparePackagePath(left.relativePath, right.relativePath));
}
function comparePackagePath(left, right) {
  if (left === right) {
    return 0;
  }
  if (left === "SKILL.md") {
    return -1;
  }
  if (right === "SKILL.md") {
    return 1;
  }
  return left < right ? -1 : 1;
}
function toRelative(root4, path) {
  const rel = relative(root4, resolve(path));
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new PathPolicyError(`Path escapes skill package: ${path}`);
  }
  return rel.split(sep).join("/");
}
async function rejectBinary(path, relativePath) {
  const buffer = await readFile4(path);
  if (buffer.includes(0)) {
    throw new ValidationError(`Refusing binary file: ${relativePath}`);
  }
}

// src/skills/frontmatter.ts
function parseSkillMetadata(text4) {
  const normalized = text4.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new ValidationError("SKILL.md must start with YAML frontmatter");
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    throw new ValidationError("SKILL.md frontmatter is not closed");
  }
  const seen = /* @__PURE__ */ new Map();
  for (const line of normalized.slice(4, end).split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) {
      throw new ValidationError(`Invalid frontmatter line: ${line}`);
    }
    const [, key, rawValue] = match;
    if (seen.has(key)) {
      throw new ValidationError(`Duplicate frontmatter field: ${key}`);
    }
    seen.set(key, normalizeScalar(rawValue));
  }
  const name = seen.get("name");
  const description = seen.get("description");
  if (!name || !description) {
    throw new ValidationError("SKILL.md requires name and description");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) {
    throw new ValidationError(`Invalid skill name: ${name}`);
  }
  const capabilities2 = parseCapabilities(seen.get("capabilities"));
  return capabilities2.length > 0 ? { name, description, capabilities: capabilities2 } : { name, description };
}
function parseCapabilities(value) {
  if (!value) {
    return [];
  }
  const body = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  const capabilities2 = body.split(",").map((item) => normalizeScalar(item)).filter(Boolean);
  if (new Set(capabilities2).size !== capabilities2.length) {
    throw new ValidationError("Duplicate skill capability");
  }
  if (!capabilities2.every(isSkillCapability)) {
    throw new ValidationError(`Invalid skill capability: ${capabilities2.find((item) => !isSkillCapability(item))}`);
  }
  return capabilities2;
}
function isSkillCapability(value) {
  return value === "filesystem-read" || value === "filesystem-write" || value === "network" || value === "shell" || value === "secrets";
}
function normalizeScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

// src/skills/hash.ts
import { createHash } from "node:crypto";
import { readFile as readFile5 } from "node:fs/promises";

// src/skills/mode.ts
function normalizePackageMode(mode) {
  return mode & 511;
}

// src/skills/hash.ts
var MODE_AWARE_HASH_PREFIX = "sha256-v2:";
async function hashPackage(files2) {
  return `${MODE_AWARE_HASH_PREFIX}${await digestPackage(files2, true)}`;
}
function isModeAwarePackageHash(packageHash5) {
  return packageHash5.startsWith(MODE_AWARE_HASH_PREFIX);
}
async function hashPackageForExpected(files2, expectedHash) {
  return isModeAwarePackageHash(expectedHash) ? await hashPackage(files2) : await digestPackage(files2, false);
}
async function digestPackage(files2, includeMode) {
  const hash2 = createHash("sha256");
  if (includeMode) {
    hash2.update("skillloom-package-v2");
    hash2.update(Buffer.from([0]));
  }
  for (const file2 of files2) {
    hash2.update(file2.relativePath);
    hash2.update(Buffer.from([0]));
    if (includeMode) {
      hash2.update(normalizePackageMode(file2.mode).toString(8).padStart(3, "0"));
      hash2.update(Buffer.from([0]));
    }
    hash2.update(await readFile5(file2.absolutePath));
    hash2.update(Buffer.from([0]));
  }
  return hash2.digest("hex");
}

// src/security/patterns.ts
var SCANNER_RULES = [
  {
    ruleId: "secret-like-material",
    severity: "danger",
    pattern: /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\b|sk-[A-Za-z0-9_-]{4,}/,
    message: "Secret-like material must not be captured"
  },
  {
    ruleId: "prompt-override",
    severity: "warning",
    pattern: /\b(?:ignore previous instructions|disregard all prior|system prompt)\b/i,
    message: "Prompt override language requires review"
  },
  {
    ruleId: "destructive-shell",
    severity: "danger",
    pattern: /\brm\s+-rf\b|\bmkfs\b|\bdd\s+if=/,
    message: "Destructive shell command is blocked"
  },
  {
    ruleId: "persistence-command",
    severity: "danger",
    pattern: /\b(?:crontab|launchctl|systemctl\s+enable)\b/,
    message: "Persistence command is blocked"
  },
  {
    ruleId: "path-escape-text",
    severity: "warning",
    pattern: /(?:^|[/"' ])\.\.(?:\/|\\)/,
    message: "Path escape reference requires review"
  },
  {
    ruleId: "encoded-execution",
    severity: "danger",
    pattern: /\b(?:base64\s+-d|eval\s*\(|node\s+-e|python3?\s+-c)\b/,
    message: "Encoded or inline execution is blocked"
  }
];

// src/security/scan.ts
function scanSkillPackage(files2, declaredExecutables = /* @__PURE__ */ new Set(), rules = SCANNER_RULES) {
  const findings = [];
  for (const file2 of [...files2].sort((left, right) => comparePackagePath(left.relativePath, right.relativePath))) {
    if (((file2.mode ?? 0) & 73) !== 0 && !declaredExecutables.has(file2.relativePath)) {
      findings.push({
        ruleId: "undeclared-executable",
        severity: "danger",
        file: file2.relativePath,
        line: 1,
        message: "Executable file must be declared by its exact local path in SKILL.md"
      });
    }
    const lines = file2.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          findings.push({
            ruleId: rule.ruleId,
            severity: rule.severity,
            file: file2.relativePath,
            line: index + 1,
            message: rule.message
          });
        }
      }
    }
  }
  return findings;
}

// src/skills/references.ts
import { posix } from "node:path";

// src/skills/_reference-patterns.ts
var RESOURCE_DIRECTORY = "(?:references|scripts|assets|examples|templates)";
var PLAIN_REFERENCE = new RegExp(`(?:^|[\\s(\\["'])(?:(?:\\.\\.?)/)*${RESOURCE_DIRECTORY}\\/[^\\s\`<>"']+`, "g");
var ABSOLUTE_REFERENCE = new RegExp(`(?:^|[\\s(\\["'])(?:/|[A-Za-z]:\\\\)${RESOURCE_DIRECTORY}(?:/|\\\\)[^\\s\`<>"']+`, "g");
var INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
var DEFINITION_LINK = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
var INLINE_CODE = /(`+)(.*?)\1/g;
var DIRECT_RESOURCE_REFERENCE = /^(?:\.\/)?(?:references|scripts|assets|examples|templates)\/.+/;
var RESOURCE_LIKE_REFERENCE = /^(?:\.\/)?(?:references|scripts|assets|examples|templates)[\\/]/;
var ABSOLUTE_RESOURCE_REFERENCE = new RegExp(`^(?:/|[A-Za-z]:\\\\)${RESOURCE_DIRECTORY}(?:/|\\\\)`);
var URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
var WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
var AMBIGUOUS_PATH_CHARACTER = /[?\\%*{}$]/;
var COMMAND_FLAG_VALUE = /--[A-Za-z0-9][A-Za-z0-9-]*(?:=|\s+)$/;
var GENERATED_OUTPUT_LINE = /^\s*(?:output|generated output|generated file|writes?|creates?|saves?)\s*:/i;

// src/skills/references.ts
function extractSkillResourceReferences(skillText) {
  const references = [];
  const seen = /* @__PURE__ */ new Set();
  let fence;
  for (const [index, line] of skillText.split(/\r?\n/).entries()) {
    const marker = line.trimStart().slice(0, 3);
    if (fence) {
      if (marker === fence) {
        fence = void 0;
      }
      continue;
    }
    if (marker === "```" || marker === "~~~") {
      fence = marker;
      continue;
    }
    for (const candidate2 of collectLineCandidates(line).sort((left, right) => left.column - right.column)) {
      const path = normalizeResourceReference(candidate2.value);
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      references.push({ path, line: index + 1 });
    }
  }
  return references;
}
function assertResourceReferencesExist(references, files2) {
  const packagePaths = new Set(files2.map((file2) => file2.relativePath));
  for (const reference of references) {
    if (!packagePaths.has(reference.path)) {
      throw new ValidationError(`Referenced resource does not exist: ${reference.path} (SKILL.md:${reference.line})`);
    }
  }
}
function collectLineCandidates(line) {
  const candidates = [];
  for (const match of line.matchAll(INLINE_LINK)) {
    candidates.push({ value: match[1], column: match.index });
  }
  const definition = DEFINITION_LINK.exec(line);
  if (definition) {
    candidates.push({ value: definition[1], column: definition.index });
  }
  if (GENERATED_OUTPUT_LINE.test(line)) {
    return candidates;
  }
  for (const match of line.matchAll(INLINE_CODE)) {
    const value = match[2].trim();
    if (isDirectResourceCandidate(value) || isAbsoluteResourceCandidate(value)) {
      candidates.push({ value, column: match.index });
    }
  }
  for (const match of line.matchAll(ABSOLUTE_REFERENCE)) {
    addPlainCandidate(candidates, line, match[0], match.index);
  }
  for (const match of line.matchAll(PLAIN_REFERENCE)) {
    addPlainCandidate(candidates, line, match[0], match.index);
  }
  return candidates;
}
function addPlainCandidate(candidates, line, raw, column) {
  const value = trimBoundary(raw);
  const valueColumn = column + raw.lastIndexOf(value);
  if (!COMMAND_FLAG_VALUE.test(line.slice(0, valueColumn))) {
    candidates.push({ value, column: valueColumn });
  }
}
function normalizeResourceReference(input) {
  let value = input.trim();
  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/[.,;:!?)\]]+$/, "");
  if (!value || value.startsWith("#") || URI_SCHEME.test(value) || value.startsWith("//")) {
    return void 0;
  }
  if (value.includes("\0")) {
    throw new ValidationError("Local resource reference contains NUL");
  }
  if (value.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(value)) {
    throw new PathPolicyError(`Absolute local resource reference is not allowed: ${value}`);
  }
  const fragment = value.indexOf("#");
  if (fragment >= 0) {
    value = value.slice(0, fragment);
  }
  const resourceLike = RESOURCE_LIKE_REFERENCE.test(value);
  if ((AMBIGUOUS_PATH_CHARACTER.test(value) || value.includes("//")) && resourceLike) {
    throw new ValidationError(`Ambiguous local resource reference: ${value}`);
  }
  const normalized = posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new PathPolicyError(`Local resource reference escapes skill package: ${input}`);
  }
  if (!isDirectResourceCandidate(normalized)) {
    if (!resourceLike) {
      return void 0;
    }
    throw new ValidationError(`Ambiguous local resource reference: ${input}`);
  }
  if (normalized.endsWith("/")) {
    throw new ValidationError(`Ambiguous local resource reference: ${input}`);
  }
  return normalized;
}
function trimBoundary(value) {
  return value.trimStart().replace(/^[(["']/, "");
}
function isDirectResourceCandidate(value) {
  return DIRECT_RESOURCE_REFERENCE.test(value);
}
function isAbsoluteResourceCandidate(value) {
  return ABSOLUTE_RESOURCE_REFERENCE.test(value);
}

// src/skills/validate.ts
async function validateSkillPackage(root4, options = {}) {
  const files2 = await collectPackageFiles(root4);
  const skill = files2.find((file2) => file2.relativePath === "SKILL.md");
  if (!skill) {
    throw new ValidationError("Skill package requires SKILL.md");
  }
  const skillText = await readFile6(skill.absolutePath, "utf8");
  const metadata2 = parseSkillMetadata(skillText);
  const references = extractSkillResourceReferences(skillText);
  assertResourceReferencesExist(references, files2);
  if (options.expectedName && metadata2.name !== options.expectedName) {
    throw new ValidationError(`Skill name mismatch: expected ${options.expectedName}, found ${metadata2.name}`);
  }
  if (options.folderNamePolicy === "match-metadata" && basename(resolve2(root4)) !== metadata2.name) {
    throw new ValidationError(`Skill folder name must match frontmatter name: ${metadata2.name}`);
  }
  const texts = await Promise.all(files2.map(async (file2) => ({
    relativePath: file2.relativePath,
    text: await readFile6(file2.absolutePath, "utf8"),
    mode: file2.mode
  })));
  return {
    metadata: metadata2,
    files: files2,
    packageHash: options.expectedHash ? await hashPackageForExpected(files2, options.expectedHash) : await hashPackage(files2),
    findings: scanSkillPackage(texts, new Set(references.map((reference) => reference.path))),
    references
  };
}

// src/store/candidates.ts
import { mkdir as mkdir6, readdir as readdir2, readFile as readFile7, rm as rm5 } from "node:fs/promises";
import { join as join6 } from "node:path";
import { createHash as createHash2 } from "node:crypto";

// src/files/package-copy.ts
import { chmod, copyFile, mkdir as mkdir5, rm as rm4 } from "node:fs/promises";
import { dirname as dirname3, join as join5 } from "node:path";
async function copyPackageFiles(files2, destination) {
  await mkdir5(dirname3(destination), { recursive: true });
  await mkdir5(destination);
  try {
    for (const file2 of files2) {
      const target = join5(destination, file2.relativePath);
      await mkdir5(dirname3(target), { recursive: true });
      await copyFile(file2.absolutePath, target);
      await chmod(target, normalizePackageMode(file2.mode));
    }
  } catch (error) {
    await rm4(destination, { recursive: true, force: true });
    throw error;
  }
}

// src/store/candidates.ts
async function readCandidate(root4, candidateId) {
  if (!/^cand-[a-zA-Z0-9-]+$/.test(candidateId)) {
    throw new Error(`Invalid candidate ID: ${candidateId}`);
  }
  return JSON.parse(await readFile7(join6(storeLayout(root4).candidates, candidateId, "candidate.json"), "utf8"));
}
async function updateCandidateValidation(root4, candidateId, findings) {
  const candidate2 = await readCandidate(root4, candidateId);
  const state = stateAfterValidation(candidate2.state, findings);
  if (state === candidate2.state && (state === "promoted" || state === "superseded")) {
    return candidate2;
  }
  const updated = { ...candidate2, state, findings };
  await atomicWriteJson(join6(storeLayout(root4).candidates, candidateId, "candidate.json"), updated);
  return updated;
}
async function listCandidates(root4) {
  const layout = storeLayout(root4);
  try {
    const ids = await readdir2(layout.candidates);
    const records = await Promise.all(ids.sort().map((id) => readCandidate(root4, id)));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
function createCandidateId(createdAt, packageHash5) {
  const stable = createHash2("sha256").update(`${createdAt}\0${packageHash5}`).digest("hex").slice(0, 12);
  return `cand-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${stable}`;
}
function cleanEvidence(evidence) {
  return evidence.slice(0, MAX_EVIDENCE_ITEMS).map((item) => {
    const trimmed = item.trim().slice(0, MAX_EVIDENCE_LENGTH);
    if (/(transcript|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-)/i.test(trimmed)) {
      return "[REDACTED]";
    }
    return trimmed;
  });
}
function stateForFindings(findings) {
  return findings.some((finding2) => finding2.severity === "danger") ? "blocked" : "captured";
}
function stateAfterValidation(state, findings) {
  if (state === "promoted" || state === "superseded") {
    return state;
  }
  return findings.some((finding2) => finding2.severity === "danger") ? "blocked" : "validated";
}

// src/store/candidate-snapshot.ts
import { mkdir as mkdir7, rename as rename3, rm as rm6 } from "node:fs/promises";
import { basename as basename2, join as join7, resolve as resolve3 } from "node:path";
async function stageCandidateSnapshot(root4, operationId, source) {
  const layout = storeLayout(root4);
  const stageRoot = join7(layout.staging, `capture-${operationId}`);
  const skillRoot = join7(stageRoot, basename2(resolve3(source)));
  await mkdir7(layout.staging, { recursive: true });
  await mkdir7(stageRoot);
  try {
    await copyPackageFiles(await collectPackageFiles(source), skillRoot);
    return { stageRoot, skillRoot };
  } catch (error) {
    await rm6(stageRoot, { recursive: true, force: true });
    throw error;
  }
}
async function commitCandidateSnapshot(root4, record, snapshot) {
  const layout = storeLayout(root4);
  const candidateRoot = join7(layout.candidates, record.candidateId);
  const skillRoot = join7(candidateRoot, "skill");
  await mkdir7(layout.candidates, { recursive: true });
  await mkdir7(candidateRoot).catch((error) => {
    if (error.code === "EEXIST") {
      throw new Error(`Candidate already exists: ${record.candidateId}`);
    }
    throw error;
  });
  try {
    await rename3(snapshot.skillRoot, skillRoot);
    await syncDirectory(candidateRoot);
    await atomicWriteJson(join7(candidateRoot, "candidate.json"), record);
    await rm6(snapshot.stageRoot, { recursive: true, force: true });
    await syncDirectory(layout.staging);
  } catch (error) {
    await rm6(candidateRoot, { recursive: true, force: true });
    await rm6(snapshot.stageRoot, { recursive: true, force: true });
    throw error;
  }
}
async function discardCandidateSnapshot(snapshot) {
  await rm6(snapshot.stageRoot, { recursive: true, force: true });
}

// src/store/operations.ts
import { mkdir as mkdir8, readdir as readdir3, readFile as readFile8 } from "node:fs/promises";
import { join as join8 } from "node:path";
async function writeOperation(root4, operation) {
  await mkdir8(storeLayout(root4).operations, { recursive: true });
  await atomicWriteJson(operationPath(root4, operation.operationId), operation);
}
async function readOperation(root4, operationId) {
  return JSON.parse(await readFile8(operationPath(root4, operationId), "utf8"));
}
async function listOperations(root4) {
  try {
    const files2 = (await readdir3(storeLayout(root4).operations)).filter((file2) => file2.endsWith(".json")).sort();
    return await Promise.all(files2.map(async (file2) => JSON.parse(await readFile8(join8(storeLayout(root4).operations, file2), "utf8"))));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
function operationPath(root4, operationId) {
  if (!/^op-[a-z]+-[a-zA-Z0-9-]+$/.test(operationId)) {
    throw new Error(`Invalid operation ID: ${operationId}`);
  }
  return join8(storeLayout(root4).operations, `${operationId}.json`);
}

// src/commands/capture.ts
async function captureCommand(command, projectRoot = process.cwd()) {
  await ensureConfig(projectRoot);
  const operationId = `op-capture-${randomUUID3()}`;
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  return await withStoreLock(projectRoot, async () => {
    const evidence = cleanEvidence(command.evidence);
    let checkpoint = {
      kind: "capture",
      operationId,
      createdAt,
      updatedAt: createdAt,
      status: "in-progress",
      phase: "started",
      recoveryAction: "Inspect temporary snapshot state and capture again"
    };
    await writeOperation(projectRoot, checkpoint);
    await appendEvent(projectRoot, { operationId, kind: "capture", phase: "started", evidence });
    let snapshot;
    try {
      snapshot = await stageCandidateSnapshot(projectRoot, operationId, resolve4(command.source));
      const validation = await validateSkillPackage(snapshot.skillRoot, { folderNamePolicy: "match-metadata" });
      const base = await captureBase(command.base, validation.metadata.name);
      checkpoint = { ...checkpoint, phase: "validated", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeOperation(projectRoot, checkpoint);
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "validated", evidence: { packageHash: validation.packageHash } });
      const record = {
        candidateId: createCandidateId(createdAt, validation.packageHash),
        operationId,
        state: stateForFindings(validation.findings),
        metadata: validation.metadata,
        packageHash: validation.packageHash,
        createdAt,
        createdBy: command.createdBy,
        evidence,
        findings: validation.findings,
        base
      };
      await commitCandidateSnapshot(projectRoot, record, snapshot);
      snapshot = void 0;
      checkpoint = { ...checkpoint, phase: "snapshotted", candidateId: record.candidateId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeOperation(projectRoot, checkpoint);
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "snapshotted", evidence: { candidateId: record.candidateId } });
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "completed", evidence: { state: record.state } });
      await writeOperation(projectRoot, {
        ...checkpoint,
        phase: "completed",
        status: "completed",
        recoveryAction: "None",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return record;
    } catch (error) {
      if (snapshot) {
        await discardCandidateSnapshot(snapshot).catch(() => void 0);
      }
      const message2 = error instanceof Error ? error.message : String(error);
      await writeOperation(projectRoot, {
        ...checkpoint,
        status: "failed",
        recoveryAction: "Inspect the error and capture again",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        error: message2
      });
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "failed", error: message2 });
      throw error;
    }
  }, { operationId, context: "capture" });
}
async function captureBase(input, expectedName) {
  if (!input) {
    return { kind: "none" };
  }
  const path = await realpath(resolve4(input));
  const validation = await validateSkillPackage(path, { expectedName, folderNamePolicy: "match-metadata" });
  if (validation.findings.some((finding2) => finding2.severity === "danger")) {
    throw new ValidationError("Installed base package has danger findings");
  }
  return { kind: "installed", path, hash: validation.packageHash };
}

// src/commands/validate.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { join as join9 } from "node:path";
async function validateCommand(command, projectRoot = process.cwd()) {
  return await withStoreLock(projectRoot, async () => {
    const operationId = `op-validate-${randomUUID4()}`;
    await appendEvent(projectRoot, {
      operationId,
      kind: "validate",
      phase: "started",
      evidence: { candidateId: command.candidateId }
    });
    try {
      const candidate2 = await readCandidate(projectRoot, command.candidateId);
      if (!isModeAwarePackageHash(candidate2.packageHash)) {
        throw new ValidationError("Legacy candidate must be recaptured before validation");
      }
      const validation = await validateSkillPackage(join9(projectRoot, ".skillloom", "candidates", command.candidateId, "skill"), {
        expectedName: candidate2.metadata.name,
        expectedHash: candidate2.packageHash
      });
      assertCandidateMatches(candidate2, validation);
      const validated = await updateCandidateValidation(projectRoot, command.candidateId, validation.findings);
      await appendEvent(projectRoot, {
        operationId,
        kind: "validate",
        phase: "validated",
        evidence: { packageHash: validation.packageHash, state: validated.state }
      });
      await appendEvent(projectRoot, { operationId, kind: "validate", phase: "completed", evidence: { candidateId: command.candidateId, findings: validation.findings.length } });
      return validated;
    } catch (error) {
      await appendEvent(projectRoot, { operationId, kind: "validate", phase: "failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}
function assertCandidateMatches(candidate2, validation) {
  if (candidate2.metadata.name !== validation.metadata.name) {
    throw new ValidationError("Candidate metadata name does not match snapshot");
  }
  if (candidate2.metadata.description !== validation.metadata.description) {
    throw new ValidationError("Candidate metadata description does not match snapshot");
  }
  if (candidate2.packageHash !== validation.packageHash) {
    throw new ValidationError("Candidate package hash does not match snapshot");
  }
}

// src/promotions/files.ts
import { lstat as lstat3, rm as rm7 } from "node:fs/promises";
import { dirname as dirname4 } from "node:path";
async function pathExists(path) {
  try {
    await lstat3(path);
    return true;
  } catch (error) {
    if (errorCode3(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}
async function hashSkillDirectory(path, expectedHash) {
  const files2 = await collectPackageFiles(path);
  return expectedHash ? await hashPackageForExpected(files2, expectedHash) : await hashPackage(files2);
}
async function stageCanonicalSkill(source, stagePath, expectedHash) {
  const files2 = await collectPackageFiles(source);
  await copyPackageFiles(files2, stagePath);
  return await hashSkillDirectory(stagePath, expectedHash);
}
async function backupSkill(destination, backupPath, expectedHash) {
  const files2 = await collectPackageFiles(destination);
  await copyPackageFiles(files2, backupPath);
  return await hashSkillDirectory(backupPath, expectedHash);
}
async function discardPromotionPath(path) {
  const existed = await pathExists(path);
  await rm7(path, { recursive: true, force: true });
  if (existed) {
    await syncDirectory(dirname4(path));
  }
}
function errorCode3(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/operations/mutation-layout.ts
async function observeMutation(target, hashes, state) {
  const observed = await inspectMutationPaths(target, hashes);
  const layouts = matchingMutationLayouts(observed, hashes);
  const allowed = allowedLayouts(state);
  const layout = allowed.find((item) => layouts.includes(item));
  if (!layout) {
    throw new ValidationError(`Mutation layout mismatch at ${target.destination}: recorded ${state}, observed ${JSON.stringify(observed)}`);
  }
  return { layout, ...observed };
}
async function inspectMutationPaths(target, hashes) {
  return {
    destinationHash: await hashAt(target.destination, hashes ? [hashes.beforeHash, hashes.afterHash] : []),
    stageHash: target.stagePath ? await hashAt(target.stagePath, hashes ? [hashes.afterHash] : []) : null,
    displacedHash: await hashAt(target.displacedPath, hashes ? [hashes.beforeHash] : [])
  };
}
function matchingMutationLayouts(observed, hashes) {
  const layouts = [];
  if (matches(observed.stageHash, hashes.afterHash) && matches(observed.destinationHash, hashes.beforeHash) && observed.displacedHash === null) {
    layouts.push("prepared");
  }
  if (matches(observed.stageHash, hashes.afterHash) && observed.destinationHash === null && matches(observed.displacedHash, hashes.beforeHash)) {
    layouts.push("displaced");
  }
  if (observed.stageHash === null && matches(observed.destinationHash, hashes.afterHash) && matches(observed.displacedHash, hashes.beforeHash)) {
    layouts.push("installed");
  }
  return layouts;
}
function allowedLayouts(state) {
  if (state === "prepared" || state === "restored") {
    return ["prepared"];
  }
  if (state === "displace-intent" || state === "undo-displace-intent") {
    return ["prepared", "displaced"];
  }
  if (state === "displaced" || state === "uninstalled") {
    return ["displaced"];
  }
  if (state === "install-intent" || state === "undo-install-intent") {
    return ["displaced", "installed"];
  }
  return ["installed"];
}
function matches(actual, expected) {
  return actual === expected;
}
async function hashAt(path, expectedHashes) {
  if (!await pathExists(path)) {
    return null;
  }
  for (const expectedHash of expectedHashes) {
    if (expectedHash && await hashSkillDirectory(path, expectedHash) === expectedHash) {
      return expectedHash;
    }
  }
  return await hashSkillDirectory(path);
}

// src/operations/status.ts
async function inspectOperationRecovery(operation) {
  if (operation.kind === "capture" || operation.status === "completed" || operation.status === "failed") {
    return null;
  }
  const targets = operation.kind === "promote" ? await Promise.all(operation.targets.map(inspectPromotionTarget)) : await Promise.all(operation.targets.map(inspectRollbackTarget));
  const phaseResumable = operation.phase === "prepared" || operation.phase === "committing" || operation.phase === "compensating";
  return {
    operationId: operation.operationId,
    kind: operation.kind,
    status: operation.status,
    phase: operation.phase,
    recoveryCommand: phaseResumable && targets.every((target) => target.valid) ? `skillloom resume ${operation.operationId} --yes` : null,
    targets
  };
}
async function inspectPromotionTarget(target) {
  const observed = await inspectMutationPaths(target);
  const hashes = promotionHashes(target);
  const observedLayouts = hashes ? matchingMutationLayouts(observed, hashes) : [];
  return {
    destination: target.destination,
    recordedState: target.state,
    observedLayouts,
    ...observed,
    valid: hashes !== null && observedLayouts.length > 0
  };
}
async function inspectRollbackTarget(target) {
  const observed = await inspectMutationPaths(target);
  const observedLayouts = matchingMutationLayouts(observed, rollbackHashes(target));
  return {
    destination: target.destination,
    recordedState: target.state,
    observedLayouts,
    ...observed,
    valid: observedLayouts.length > 0
  };
}
function promotionHashes(target) {
  if (!target.before) {
    return null;
  }
  return {
    beforeHash: target.before.kind === "present" ? target.before.hash : null,
    afterHash: target.afterHash
  };
}
function rollbackHashes(target) {
  return {
    beforeHash: target.activeHash,
    afterHash: target.before.kind === "present" ? target.before.hash : null
  };
}

// src/store/promotions.ts
import { mkdir as mkdir9, readdir as readdir4, readFile as readFile9 } from "node:fs/promises";
import { join as join10 } from "node:path";
async function writePromotionRecord(root4, record) {
  assertPromotionId(record.promotionId);
  const directory = join10(storeLayout(root4).promotions, record.promotionId);
  await mkdir9(directory, { recursive: true });
  await atomicWriteJson(join10(directory, "promotion.json"), record);
}
async function readPromotion(root4, promotionId) {
  assertPromotionId(promotionId);
  const path = join10(storeLayout(root4).promotions, promotionId, "promotion.json");
  return JSON.parse(await readFile9(path, "utf8"));
}
function assertPromotionId(promotionId) {
  if (!/^promo-[a-zA-Z0-9-]+$/.test(promotionId)) {
    throw new Error(`Invalid promotion ID: ${promotionId}`);
  }
}
async function listPromotions(root4) {
  try {
    const ids = await readdir4(storeLayout(root4).promotions);
    const records = await Promise.all(ids.sort().map((id) => readPromotion(root4, id)));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// src/store/learning.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { mkdir as mkdir10, readdir as readdir5, readFile as readFile10, rm as rm8 } from "node:fs/promises";
import { join as join11 } from "node:path";

// src/learning/brain-handoff.ts
import { createHash as createHash3 } from "node:crypto";
async function writeProposalToBrain(event, proposal2, writer) {
  const episodeResult = await writer.capture(episodeToBrainCaptureInput(event));
  await writer.capture(proposalToBrainCaptureInput(proposal2, episodeResult.artifact.id));
}
function episodeToBrainCaptureInput(event) {
  const episode = event.episode;
  if (episode === void 0) throw new Error("Learning event has no bounded episode");
  return {
    actor: { actorId: "skillloom-learning" },
    requestId: requestIdFor(`episode:${event.eventId}`),
    type: "bounded-episode",
    title: `Bounded episode: ${episode.taskId}`,
    content: event.summary,
    frontmatter: {
      eventId: event.eventId,
      toolCategories: episode.evidence.map((item) => item.category),
      verifierSignals: episode.verifierSignals.map((item) => `${item.kind}:${item.status}`)
    },
    provenance: {
      source: "skillloom-learning-episode",
      eventId: event.eventId,
      provenanceHashes: episode.provenanceHashes
    },
    details: {
      kind: "episode",
      taskId: episode.taskId,
      hostId: episode.host,
      startedAt: episode.startedAt,
      endedAt: episode.endedAt,
      outcome: episode.outcome === "unknown" ? "partial" : episode.outcome
    },
    sensitivity: "tailnet"
  };
}
function proposalToBrainCaptureInput(proposal2, targetArtifactId) {
  const base = {
    actor: { actorId: "skillloom-learning" },
    requestId: requestIdFor(proposal2.proposalId),
    title: proposal2.title,
    content: proposal2.content,
    provenance: {
      source: "skillloom-learning-consolidation",
      proposalId: proposal2.proposalId,
      jobId: proposal2.jobId,
      targetEpisodeArtifactId: targetArtifactId,
      evidenceEventIds: proposal2.evidenceEventIds,
      provenanceHashes: proposal2.provenanceHashes,
      reason: proposal2.reason
    },
    sensitivity: "tailnet"
  };
  if (proposal2.kind === "feedback") {
    return {
      ...base,
      type: "feedback",
      layer: "agent-knowledge",
      details: { kind: "feedback", targetArtifactId, signal: "negative", reason: proposal2.reason }
    };
  }
  if (proposal2.kind === "workflow-draft") {
    return {
      ...base,
      type: "workflow",
      layer: "workflow",
      details: { kind: "workflow", trigger: proposal2.title, steps: [proposal2.content], verifier: "held until G005 replay or held-out evaluation", promotable: false }
    };
  }
  if (proposal2.kind === "rejected-update") {
    return {
      ...base,
      type: "rejected-update",
      layer: "agent-knowledge",
      details: { kind: "rejected-update", targetArtifactId, rejectedAt: proposal2.createdAt, reason: proposal2.reason, retryable: proposal2.retryable }
    };
  }
  return {
    ...base,
    type: "fact",
    layer: "agent-knowledge",
    details: { kind: "knowledge", status: "draft", confidence: 0.6 }
  };
}
function episodeToBrainHandoff(event, episodeHash) {
  if (event.episode === void 0) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    kind: "episode",
    handoffId: episodeHandoffId(episodeHash),
    eventId: event.eventId,
    status: "pending",
    attempts: 0,
    capture: { ...episodeToBrainCaptureInput(event), requestId: requestIdFor(`episode:${episodeHash}`) },
    createdAt: now,
    updatedAt: now
  };
}
function proposalToBrainHandoff(proposal2, episodeHandoffId2) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    kind: "proposal",
    handoffId: proposal2.proposalId,
    proposalId: proposal2.proposalId,
    episodeHandoffId: episodeHandoffId2,
    proposal: proposal2,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
}
function episodeHandoffId(eventId) {
  return `episode-${requestIdFor(eventId)}`;
}
function requestIdFor(value) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)) return value;
  const hash2 = createHash3("sha256").update(value).digest("hex");
  return `${hash2.slice(0, 8)}-${hash2.slice(8, 12)}-4${hash2.slice(13, 16)}-a${hash2.slice(17, 20)}-${hash2.slice(20, 32)}`;
}

// src/learning/episode.ts
import { createHash as createHash4 } from "node:crypto";

// src/learning/redaction.ts
var learningSecretPatterns = [
  /\btranscript\b/iu,
  /\b(?:password|passwd|pwd|secret|token|cookie|set-cookie)\s*[:=]\s*\S+/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/u
];
function redactLearningText(value, limit) {
  const cleaned = value.trim().replace(/\s+/gu, " ").slice(0, limit) || "[REDACTED]";
  return containsUnsafeLearningText(cleaned) ? "[REDACTED]" : cleaned;
}
function containsUnsafeLearningText(value) {
  return SCANNER_RULES.some((rule) => {
    rule.pattern.lastIndex = 0;
    return rule.severity === "danger" && rule.pattern.test(value);
  }) || learningSecretPatterns.some((pattern) => pattern.test(value));
}

// src/learning/episode.ts
function buildLearningEpisode(input, now = /* @__PURE__ */ new Date()) {
  const endedAt = normalizeTimestamp(input.endedAt, now.toISOString());
  const startedAt = normalizeTimestamp(input.startedAt, endedAt);
  const evidence = bounded(input.evidence ?? [], 8).map((item) => evidenceItem(item.summary, item.category ?? "unknown", item.provenance));
  const verifierSignals = bounded(input.verifierSignals ?? [], 8).map((item) => verifierSignal(item.kind, item.status, item.summary, item.provenance));
  const provenanceHashes2 = [.../* @__PURE__ */ new Set([...evidence.map((item) => item.provenanceHash), ...verifierSignals.map((item) => item.provenanceHash)])].slice(0, 16);
  return {
    taskId: clean(input.taskId ?? `task-${hashText(`${input.host}:${startedAt}:${endedAt}`).slice(7, 19)}`, 120),
    host: input.host,
    outcome: input.outcome ?? "unknown",
    startedAt,
    endedAt,
    evidence,
    verifierSignals,
    provenanceHashes: provenanceHashes2
  };
}
function hashEpisodeIdentity(episode) {
  return hashText(JSON.stringify({
    taskId: episode.taskId,
    host: episode.host,
    outcome: episode.outcome,
    evidence: episode.evidence,
    verifierSignals: episode.verifierSignals,
    provenanceHashes: episode.provenanceHashes
  }));
}
function cleanLearningSummary(summary) {
  return redactLearningText(summary, 500);
}
function evidenceItem(summary, category, provenance2) {
  const cleaned = clean(summary, 240);
  return {
    summary: redactLearningText(cleaned, 240),
    category,
    provenanceHash: provenanceHash(provenance2 ?? `${category}:${cleaned}`)
  };
}
function verifierSignal(kind, status, summary, provenance2) {
  const cleaned = clean(summary, 240);
  return {
    kind,
    status,
    summary: redactLearningText(cleaned, 240),
    provenanceHash: provenanceHash(provenance2 ?? `${kind}:${status}:${cleaned}`)
  };
}
function clean(value, limit) {
  return value.trim().replace(/\s+/gu, " ").slice(0, limit) || "[REDACTED]";
}
function normalizeTimestamp(value, fallback) {
  if (value === void 0 || Number.isNaN(Date.parse(value))) return new Date(fallback).toISOString();
  return new Date(value).toISOString();
}
function provenanceHash(value) {
  return value.startsWith("sha256:") && /^sha256:[0-9a-f]{64}$/u.test(value) ? value : hashText(value);
}
function hashText(value) {
  return `sha256:${createHash4("sha256").update(value).digest("hex")}`;
}
function bounded(items, limit) {
  return items.slice(0, limit);
}

// src/learning/types.ts
function parseLearningEvent(value) {
  if (!isRecord2(value) || typeof value.eventId !== "string" || !value.eventId.startsWith("learn-") || typeof value.createdAt !== "string" || invalidDate(value.createdAt) || !isSource2(value.source) || !isOutcome2(value.outcome) || typeof value.summary !== "string" || value.summary.length > 500 || value.candidateId !== void 0 && typeof value.candidateId !== "string" || value.episode !== void 0 && !isEpisode(value.episode)) {
    throw new ValidationError("Invalid Skillloom learning event");
  }
  return {
    eventId: value.eventId,
    createdAt: value.createdAt,
    source: value.source,
    outcome: value.outcome,
    summary: value.summary,
    ...value.candidateId ? { candidateId: value.candidateId } : {},
    ...value.episode === void 0 ? {} : { episode: value.episode }
  };
}
function parseConsolidationJob(value) {
  if (!isRecord2(value) || typeof value.jobId !== "string" || !value.jobId.startsWith("consolidate-") || typeof value.eventId !== "string" || !value.eventId.startsWith("learn-") || !isSha256(value.episodeHash) || !isJobStatus(value.status) || typeof value.attempts !== "number" || !Number.isInteger(value.attempts) || value.attempts < 0 || typeof value.createdAt !== "string" || invalidDate(value.createdAt) || typeof value.updatedAt !== "string" || invalidDate(value.updatedAt) || value.cursor !== void 0 && typeof value.cursor !== "string" || value.lastError !== void 0 && typeof value.lastError !== "string") {
    throw new ValidationError("Invalid Skillloom consolidation job");
  }
  return {
    jobId: value.jobId,
    eventId: value.eventId,
    episodeHash: value.episodeHash,
    status: value.status,
    attempts: value.attempts,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...value.cursor === void 0 ? {} : { cursor: value.cursor },
    ...value.lastError === void 0 ? {} : { lastError: value.lastError }
  };
}
function parseConsolidationProposal(value) {
  if (!isRecord2(value) || typeof value.proposalId !== "string" || !value.proposalId.startsWith("proposal-") || typeof value.jobId !== "string" || !value.jobId.startsWith("consolidate-") || !isProposalKind(value.kind) || typeof value.title !== "string" || value.title.length === 0 || value.title.length > 160 || typeof value.content !== "string" || value.content.length === 0 || value.content.length > 2e3 || typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 500 || typeof value.retryable !== "boolean" || !isStringArray(value.evidenceEventIds) || !isStringArray(value.provenanceHashes) || !value.provenanceHashes.every(isSha256) || typeof value.createdAt !== "string" || invalidDate(value.createdAt)) {
    throw new ValidationError("Invalid Skillloom consolidation proposal");
  }
  return {
    proposalId: value.proposalId,
    jobId: value.jobId,
    kind: value.kind,
    title: value.title,
    content: value.content,
    reason: value.reason,
    retryable: value.retryable,
    evidenceEventIds: value.evidenceEventIds,
    provenanceHashes: value.provenanceHashes,
    createdAt: value.createdAt
  };
}
function isEpisode(value) {
  if (!isRecord2(value) || typeof value.taskId !== "string" || value.taskId.length === 0 || value.taskId.length > 120 || !isSource2(value.host) || !isTaskOutcome2(value.outcome) || typeof value.startedAt !== "string" || invalidDate(value.startedAt) || typeof value.endedAt !== "string" || invalidDate(value.endedAt) || !Array.isArray(value.evidence) || value.evidence.length > 8 || !value.evidence.every(isEvidence) || !Array.isArray(value.verifierSignals) || value.verifierSignals.length > 8 || !value.verifierSignals.every(isVerifierSignal) || !isStringArray(value.provenanceHashes) || value.provenanceHashes.length > 16 || !value.provenanceHashes.every(isSha256)) {
    return false;
  }
  return Date.parse(value.startedAt) <= Date.parse(value.endedAt);
}
function isEvidence(value) {
  return isRecord2(value) && typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 240 && isToolCategory(value.category) && isSha256(value.provenanceHash);
}
function isVerifierSignal(value) {
  return isRecord2(value) && (value.kind === "test" || value.kind === "typecheck" || value.kind === "lint" || value.kind === "build" || value.kind === "review" || value.kind === "runtime") && (value.status === "passed" || value.status === "failed" || value.status === "unknown") && typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 240 && isSha256(value.provenanceHash);
}
function isSource2(value) {
  return value === "claude" || value === "codex" || value === "agents" || value === "generic";
}
function isOutcome2(value) {
  return value === "no-op" || value === "memory" || value === "skill-create" || value === "skill-patch";
}
function isTaskOutcome2(value) {
  return value === "success" || value === "failure" || value === "cancelled" || value === "unknown";
}
function isToolCategory(value) {
  return value === "filesystem" || value === "shell" || value === "network" || value === "browser" || value === "mcp" || value === "test" || value === "build" || value === "unknown";
}
function isJobStatus(value) {
  return value === "pending" || value === "processing" || value === "complete" || value === "failed";
}
function isProposalKind(value) {
  return value === "feedback" || value === "heuristic" || value === "workflow-draft" || value === "rejected-update";
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isSha256(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function invalidDate(value) {
  return Number.isNaN(Date.parse(value));
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/store/learning.ts
async function writeLearningEvent(root4, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const episode = input.episode === void 0 ? void 0 : buildLearningEpisode(input.episode);
  const event = {
    eventId: `learn-${randomUUID5()}`,
    createdAt: now,
    source: input.source,
    outcome: input.outcome,
    summary: cleanLearningSummary(input.summary),
    ...input.candidateId ? { candidateId: input.candidateId } : {},
    ...episode === void 0 ? {} : { episode }
  };
  const layout = storeLayout(root4);
  await mkdir10(layout.learningEvents, { recursive: true });
  await atomicWriteJson(join11(layout.learningEvents, `${event.eventId}.json`), event);
  if (event.episode !== void 0) {
    const episodeHash = hashEpisodeIdentity(event.episode);
    const handoff = episodeToBrainHandoff(event, episodeHash);
    if (handoff !== null) await writeBrainLearningHandoff(root4, handoff);
    await enqueueConsolidationJob(root4, event, episodeHash);
  }
  return event;
}
async function listLearningEvents(root4) {
  return await readJsonDirectory(storeLayout(root4).learningEvents, parseLearningEvent, "createdAt");
}
async function enqueueConsolidationJob(root4, event, existingEpisodeHash) {
  if (event.episode === void 0) return null;
  const layout = storeLayout(root4);
  await mkdir10(layout.learningConsolidationJobs, { recursive: true });
  const episodeHash = existingEpisodeHash ?? hashEpisodeIdentity(event.episode);
  const existing = await findConsolidationJobByEpisodeHash(root4, episodeHash);
  if (existing) return existing;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const job = {
    jobId: `consolidate-${randomUUID5()}`,
    eventId: event.eventId,
    episodeHash,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
  await atomicWriteJson(consolidationJobPath(root4, job.jobId), job, { mode: 384 });
  return job;
}
async function listConsolidationJobs(root4) {
  return await readJsonDirectory(storeLayout(root4).learningConsolidationJobs, parseConsolidationJob, "createdAt");
}
async function writeConsolidationJob(root4, job) {
  await mkdir10(storeLayout(root4).learningConsolidationJobs, { recursive: true });
  await atomicWriteJson(consolidationJobPath(root4, job.jobId), parseConsolidationJob(job), { mode: 384 });
}
async function writeConsolidationProposal(root4, proposal2) {
  await mkdir10(storeLayout(root4).learningConsolidationProposals, { recursive: true });
  await atomicWriteJson(join11(storeLayout(root4).learningConsolidationProposals, `${proposal2.proposalId}.json`), parseConsolidationProposal(proposal2), { mode: 384 });
  await writeBrainLearningHandoff(root4, proposalToBrainHandoff(proposal2, await proposalEpisodeHandoffId(root4, proposal2)));
}
async function listConsolidationProposals(root4) {
  return await readJsonDirectory(storeLayout(root4).learningConsolidationProposals, parseConsolidationProposal, "createdAt");
}
async function writeBrainLearningHandoff(root4, handoff) {
  await mkdir10(storeLayout(root4).learningBrainHandoffs, { recursive: true });
  const existing = await readBrainLearningHandoff(root4, handoff.handoffId);
  if (existing?.status === "drained") return;
  await atomicWriteJson(brainLearningHandoffPath(root4, handoff.handoffId), handoff, { mode: 384 });
}
async function resetProcessingConsolidationJobs(root4) {
  const jobs = await listConsolidationJobs(root4);
  await Promise.all(jobs.filter((job) => job.status === "processing").map(async (job) => {
    await writeConsolidationJob(root4, {
      ...job,
      status: "pending",
      cursor: "recovered-processing",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }));
}
async function findConsolidationJobByEpisodeHash(root4, episodeHash) {
  return (await listConsolidationJobs(root4)).find((job) => job.episodeHash === episodeHash) ?? null;
}
async function proposalEpisodeHandoffId(root4, proposal2) {
  const job = (await listConsolidationJobs(root4)).find((item) => item.jobId === proposal2.jobId);
  return episodeHandoffId(job?.episodeHash ?? proposal2.evidenceEventIds[0] ?? proposal2.jobId);
}
function consolidationJobPath(root4, jobId) {
  return join11(storeLayout(root4).learningConsolidationJobs, `${jobId}.json`);
}
function brainLearningHandoffPath(root4, handoffId) {
  return join11(storeLayout(root4).learningBrainHandoffs, `${handoffId}.json`);
}
async function readBrainLearningHandoff(root4, handoffId) {
  try {
    return parseBrainLearningHandoff(JSON.parse(await readFile10(brainLearningHandoffPath(root4, handoffId), "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
function parseBrainLearningHandoff(value) {
  if (!isBrainLearningHandoff(value)) {
    throw new Error("Invalid Skillloom Brain handoff");
  }
  return value;
}
function isBrainLearningHandoff(value) {
  if (!isRecord3(value) || typeof value.handoffId !== "string" || value.status !== "pending" && value.status !== "drained" && value.status !== "failed" || typeof value.attempts !== "number" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    return false;
  }
  if (value.kind === "episode") {
    return typeof value.eventId === "string" && isCaptureInput(value.capture);
  }
  return value.kind === "proposal" && typeof value.proposalId === "string" && typeof value.episodeHandoffId === "string" && isRecord3(value.proposal);
}
function isCaptureInput(value) {
  return isRecord3(value) && isRecord3(value.actor) && typeof value.actor.actorId === "string" && typeof value.requestId === "string" && typeof value.type === "string" && typeof value.title === "string" && typeof value.content === "string" && isRecord3(value.provenance) && typeof value.sensitivity === "string";
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJsonDirectory(path, parse2, sortKey) {
  try {
    const entries = (await readdir5(path)).filter((entry) => entry.endsWith(".json")).sort();
    const records = await Promise.all(entries.map(async (entry) => parse2(JSON.parse(await readFile10(join11(path, entry), "utf8")))));
    return records.sort((left, right) => String(left[sortKey]).localeCompare(String(right[sortKey])));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

// mode-profile.mjs
var INVOKED_HOSTS = Object.freeze({ claude: "invoked", codex: "invoked", agents: "invoked" });
var MODE_PROFILES = Object.freeze({
  manual: Object.freeze({
    reviewTrigger: "manual",
    brainCapture: "manual",
    retrieval: "explicit",
    contextRefresh: "automatic",
    promotion: "manual",
    hostLifecycle: INVOKED_HOSTS
  }),
  policy: Object.freeze({
    reviewTrigger: "manual",
    brainCapture: "manual",
    retrieval: "explicit",
    contextRefresh: "automatic",
    promotion: "policy",
    hostLifecycle: INVOKED_HOSTS
  }),
  hermes: Object.freeze({
    reviewTrigger: "meaningful-delta",
    brainCapture: "auto-curated",
    retrieval: "auto-bounded",
    contextRefresh: "automatic",
    promotion: "policy",
    hostLifecycle: Object.freeze({ claude: "automatic", codex: "invoked", agents: "invoked" })
  })
});
function modeProfileFor(mode) {
  const profile = MODE_PROFILES[mode];
  if (!profile) {
    throw new TypeError(`Unknown Skillloom mode: ${mode}`);
  }
  return { ...profile, hostLifecycle: { ...profile.hostLifecycle } };
}

// src/commands/status.ts
async function statusCommand(_command, projectRoot = process.cwd()) {
  const operations = (await listOperations(projectRoot)).filter((operation) => operation.status !== "completed");
  const journal = await inspectJournal(projectRoot);
  const journalLock = await readJournalLockDiagnostic(projectRoot);
  const recovery = (await Promise.all(operations.map(inspectOperationRecovery))).filter((item) => item !== null).map((item) => {
    const journalAvailable = journalLock.state === "unlocked" || journalLock.state === "stale" && journalLock.operationId === item.operationId;
    return journal.health.state === "healthy" && journalAvailable ? item : { ...item, recoveryCommand: null };
  });
  const lock = await readLockDiagnostic(projectRoot);
  const lockRecovery = lock.state === "stale" && lock.operationId ? recovery.find((item) => item.operationId === lock.operationId)?.recoveryCommand : null;
  const mode = (await readConfig(projectRoot))?.mode ?? "manual";
  return {
    mode,
    automation: modeProfileFor(mode),
    learning: await listLearningEvents(projectRoot),
    candidates: await listCandidates(projectRoot),
    promotions: await listPromotions(projectRoot),
    events: journal.events,
    journal: journal.health,
    operations,
    recovery,
    lock: lock.state === "stale" && lockRecovery ? { ...lock, action: lockRecovery } : lock,
    journalLock: journalLock.state === "stale" ? {
      ...journalLock,
      action: recovery.find((item) => item.operationId === journalLock.operationId)?.recoveryCommand ?? (journal.health.state === "healthy" ? "skillloom recover-lock journal --yes" : `Blocked until journal is healthy: ${journal.health.state}`)
    } : journalLock
  };
}

// src/commands/promote.ts
import { homedir } from "node:os";

// src/adapters/claude-code.ts
import { join as join14 } from "node:path";

// src/adapters/doctor-runtime.ts
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join as join12 } from "node:path";
async function checkRuntime(target, executable, displayName, searchPath) {
  for (const directory of searchPath.split(delimiter).filter(Boolean)) {
    const executablePath = join12(directory, executable);
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

// src/adapters/doctor-discovery.ts
import { constants as constants2 } from "node:fs";
import { access as access2, readdir as readdir6, stat as stat2 } from "node:fs/promises";
import { join as join13 } from "node:path";
async function checkDiscoveryRoot(target, scope, path) {
  try {
    const rootStat = await stat2(path);
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
    await access2(path, constants2.R_OK);
  } catch (error) {
    const missing = errorCode4(error) === "ENOENT";
    return [{
      kind: "discovery-root",
      target,
      scope,
      path,
      status: "warning",
      message: missing ? "Discovery root does not exist yet" : `Discovery root cannot be read: ${errorMessage(error)}`,
      remediation: missing ? scope === "explicit" ? "Promote a skill to this explicit destination to create the root." : `Promote a skill to ${scope} scope to create this root.` : "Fix directory ownership or read permissions before using this target."
    }];
  }
  const checks = [{
    kind: "discovery-root",
    target,
    scope,
    path,
    status: "ok",
    message: "Discovery root is readable"
  }];
  let entries;
  try {
    entries = await readdir6(path, { withFileTypes: true });
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
    const skillPath = join13(path, entry.name);
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
        message: findings.length === 0 ? "Active skill package is valid" : `Active skill package has ${findings.length} trust finding(s)`,
        ...findings.length === 0 ? {} : { remediation: "Review the installed skill trust findings before using it." }
      });
    } catch (error) {
      checks.push(invalidSkillCheck(target, scope, skillPath, entry.name, errorMessage(error)));
    }
  }
  return checks;
}
function invalidSkillCheck(target, scope, path, skillName2, error) {
  return {
    kind: "installed-skill",
    target,
    scope,
    path,
    skillName: skillName2,
    state: "invalid",
    error,
    status: "warning",
    message: "Active skill package is invalid",
    remediation: "Repair or remove this skill before relying on native discovery."
  };
}
function errorCode4(error) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return void 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/adapters/path-policy.ts
import { dirname as dirname5, isAbsolute, parse, relative as relative2, resolve as resolve5 } from "node:path";
function resolveSkillDestination(root4, skillName2) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(skillName2)) {
    throw new PathPolicyError(`Unsafe skill name: ${skillName2}`);
  }
  const destinationRoot = resolve5(root4);
  const destination = resolve5(destinationRoot, skillName2);
  if (dirname5(destination) !== destinationRoot) {
    throw new PathPolicyError(`Skill destination escapes discovery root: ${skillName2}`);
  }
  return destination;
}
function assertSafePhysicalDestinationRoot(projectRoot, storeRoot, destinationRoot, input, relativeInput) {
  if (destinationRoot === parse(destinationRoot).root || destinationRoot === projectRoot) {
    throw new PathPolicyError(`Generic destination root is physically too broad: ${input}`);
  }
  if (destinationRoot === storeRoot || isWithin(storeRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root physically uses the Skillloom store: ${input}`);
  }
  if (relativeInput && !isWithin(projectRoot, destinationRoot)) {
    throw new PathPolicyError(`Relative generic destination escapes the physical project: ${input}`);
  }
}
function resolveExplicitDestinationRoot(projectRoot, input) {
  if (!isAbsolute(projectRoot)) {
    throw new PathPolicyError("Adapter project root must be absolute");
  }
  const segments = input.split(/[\\/]+/);
  if (input.length === 0 || input.trim() !== input || input.includes("\0") || segments.includes(".") || segments.includes("..")) {
    throw new PathPolicyError("Generic destination root is empty or malformed");
  }
  const resolvedProjectRoot = resolve5(projectRoot);
  const destinationRoot = isAbsolute(input) ? resolve5(input) : resolve5(resolvedProjectRoot, input);
  if (destinationRoot === parse(destinationRoot).root || destinationRoot === resolvedProjectRoot) {
    throw new PathPolicyError(`Generic destination root is too broad: ${input}`);
  }
  const storeRoot = resolve5(resolvedProjectRoot, ".skillloom");
  if (destinationRoot === storeRoot || isWithin(storeRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root cannot use the Skillloom store: ${input}`);
  }
  if (!isAbsolute(input) && !isWithin(resolvedProjectRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root escapes the project: ${input}`);
  }
  return destinationRoot;
}
function isWithin(parent, child) {
  const path = relative2(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

// src/adapters/claude-code.ts
function root(context, scope) {
  return join14(scope === "project" ? context.projectRoot : context.homeDir, ".claude", "skills");
}
var claudeCodeAdapter = {
  kind: "scoped",
  name: "claude",
  resolveDestination(context, scope, skillName2) {
    return resolveSkillDestination(root(context, scope), skillName2);
  },
  async doctor(context) {
    const checks = [await checkRuntime("claude", "claude", "Claude Code", context.executableSearchPath ?? process.env.PATH ?? "")];
    for (const scope of ["project", "user"]) {
      checks.push(...await checkDiscoveryRoot("claude", scope, root(context, scope)));
    }
    return checks;
  }
};

// src/adapters/codex.ts
import { join as join15 } from "node:path";
function root2(context, scope) {
  return join15(scope === "project" ? context.projectRoot : context.homeDir, ".agents", "skills");
}
var codexAdapter = {
  kind: "scoped",
  name: "codex",
  resolveDestination(context, scope, skillName2) {
    return resolveSkillDestination(root2(context, scope), skillName2);
  },
  async doctor(context) {
    const checks = [await checkRuntime("codex", "codex", "Codex", context.executableSearchPath ?? process.env.PATH ?? "")];
    for (const scope of ["project", "user"]) {
      checks.push(...await checkDiscoveryRoot("codex", scope, root2(context, scope)));
    }
    return checks;
  }
};

// src/adapters/agents.ts
import { join as join16 } from "node:path";
function root3(context, scope) {
  return join16(scope === "project" ? context.projectRoot : context.homeDir, ".agents", "skills");
}
var agentsAdapter = {
  kind: "scoped",
  name: "agents",
  resolveDestination(context, scope, skillName2) {
    return resolveSkillDestination(root3(context, scope), skillName2);
  },
  async doctor(context) {
    const checks = [];
    for (const scope of ["project", "user"]) {
      checks.push(...await checkDiscoveryRoot("agents", scope, root3(context, scope)));
    }
    return checks;
  }
};

// src/adapters/generic-path.ts
import { isAbsolute as isAbsolute2 } from "node:path";

// src/adapters/physical-path.ts
import { lstat as lstat4, realpath as realpath2, stat as stat3 } from "node:fs/promises";
import { basename as basename3, dirname as dirname6, resolve as resolve6 } from "node:path";
async function canonicalizeFuturePath(path) {
  let cursor = resolve6(path);
  const tail = [];
  while (true) {
    try {
      await lstat4(cursor);
    } catch (error) {
      if (errorCode5(error) !== "ENOENT") {
        throw pathError(path, error);
      }
      const parent = dirname6(cursor);
      if (parent === cursor) {
        throw new PathPolicyError(`Cannot resolve a physical ancestor for: ${path}`);
      }
      tail.unshift(basename3(cursor));
      cursor = parent;
      continue;
    }
    try {
      const physicalAncestor = await realpath2(cursor);
      if (!(await stat3(physicalAncestor)).isDirectory()) {
        throw new PathPolicyError(`Physical path ancestor is not a directory: ${cursor}`);
      }
      return resolve6(physicalAncestor, ...tail);
    } catch (error) {
      if (error instanceof PathPolicyError) {
        throw error;
      }
      throw pathError(path, error);
    }
  }
}
function pathError(path, error) {
  const message2 = error instanceof Error ? error.message : String(error);
  return new PathPolicyError(`Cannot resolve physical path '${path}': ${message2}`);
}
function errorCode5(error) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return void 0;
}

// src/adapters/generic-path.ts
async function canonicalizeGenericRoot(context, destinationRoot, lexicalRoot) {
  const [physicalRoot, physicalProjectRoot, physicalStoreRoot] = await Promise.all([
    canonicalizeFuturePath(lexicalRoot),
    canonicalizeFuturePath(context.projectRoot),
    canonicalizeFuturePath(storeLayout(context.projectRoot).root)
  ]);
  assertSafePhysicalDestinationRoot(
    physicalProjectRoot,
    physicalStoreRoot,
    physicalRoot,
    destinationRoot,
    !isAbsolute2(destinationRoot)
  );
  return physicalRoot;
}

// src/adapters/generic.ts
var genericAdapter = {
  kind: "directory",
  name: "generic",
  resolveRoot(context, destinationRoot) {
    return resolveExplicitDestinationRoot(context.projectRoot, destinationRoot);
  },
  resolveDestination(context, destinationRoot, skillName2) {
    return resolveSkillDestination(this.resolveRoot(context, destinationRoot), skillName2);
  },
  async doctor(context, destinationRoot) {
    const lexicalRoot = this.resolveRoot(context, destinationRoot);
    const root4 = await canonicalizeGenericRoot(context, destinationRoot, lexicalRoot);
    return await checkDiscoveryRoot("generic", "explicit", root4);
  }
};

// src/adapters/registry.ts
function getScopedAdapter(name) {
  const adapter = getAdapter(name);
  if (adapter.kind !== "scoped") {
    throw new UsageError(`Target is not scope-based: ${name}`);
  }
  return adapter;
}
function getGenericAdapter() {
  return genericAdapter;
}
function getAdapter(name) {
  if (name === "claude") {
    return claudeCodeAdapter;
  }
  if (name === "codex") {
    return codexAdapter;
  }
  if (name === "agents") {
    return agentsAdapter;
  }
  if (name === "generic") {
    return genericAdapter;
  }
  throw new UsageError(`Unknown target: ${name}`);
}

// src/promotions/service.ts
import { randomUUID as randomUUID6 } from "node:crypto";

// src/operations/promotion-checkpoint.ts
async function persistPromotionCheckpoint(root4, checkpoint, hooks) {
  await writeOperation(root4, checkpoint);
  try {
    await hooks.afterCheckpoint?.(checkpoint);
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    const interrupted = {
      ...checkpoint,
      status: "interrupted",
      recoveryAction: "Run resume with this operation ID after verifying the reported paths",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: message2
    };
    await writeOperation(root4, interrupted);
    await appendEvent(root4, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "interrupted",
      evidence: { phase: checkpoint.phase, recoveryAction: interrupted.recoveryAction },
      error: message2
    });
    throw new OperationInterruptedError(message2);
  }
}

// src/operations/mutation-files.ts
import { rename as rename4 } from "node:fs/promises";
import { dirname as dirname7 } from "node:path";
async function durableRename(from, to) {
  await rename4(from, to);
  await syncDirectory(dirname7(to));
}

// src/operations/mutation-service.ts
async function applyMutation(context) {
  let state = context.state;
  if (state === "prepared") {
    state = await transition(context, "displace-intent");
  }
  if (state === "displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "prepared" && context.hashes.beforeHash) {
      await durableRename(context.target.destination, context.target.displacedPath);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-displaced-rename`);
    }
    state = await transition(context, "displaced");
  }
  if (state === "displaced") {
    state = await transition(context, "install-intent");
  }
  if (state === "install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "displaced" && context.hashes.afterHash && context.target.stagePath) {
      await durableRename(context.target.stagePath, context.target.destination);
      await context.afterBoundary?.(`${context.boundaryPrefix}:stage-installed-rename`);
    }
    state = await transition(context, "installed");
  }
  await observeMutation(context.target, context.hashes, "installed");
}
async function revertMutation(context) {
  let state = context.state;
  if (state === "prepared" || state === "restored") {
    await observeMutation(context.target, context.hashes, "restored");
    return;
  }
  if (state === "displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    state = await transition(context, observed.layout === "prepared" ? "restored" : "uninstalled");
  }
  if (state === "displaced" || state === "install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    state = await transition(context, observed.layout === "installed" ? "installed" : "uninstalled");
  }
  if (state === "installed") {
    state = await transition(context, "undo-install-intent");
  }
  if (state === "undo-install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "installed" && context.hashes.afterHash && context.target.stagePath) {
      await durableRename(context.target.destination, context.target.stagePath);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-uninstalled-rename`);
    }
    state = await transition(context, "uninstalled");
  }
  if (state === "uninstalled") {
    state = await transition(context, "undo-displace-intent");
  }
  if (state === "undo-displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "displaced" && context.hashes.beforeHash) {
      await durableRename(context.target.displacedPath, context.target.destination);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-restored-rename`);
    }
    state = await transition(context, "restored");
  }
  await observeMutation(context.target, context.hashes, "restored");
}
function transition(context, state) {
  return context.transition(state, `${context.boundaryPrefix}:${state}-checkpoint`).then(() => state);
}

// src/promotions/_cleanup.ts
async function cleanupPromotionPaths(phase, paths, hooks) {
  const results = await Promise.allSettled(paths.map(async (path, index) => {
    await hooks.beforeCleanup?.(phase, path, index);
    await discardPromotionPath(path);
  }));
  return results.flatMap((result, index) => result.status === "rejected" ? [`${phase} cleanup failed for ${paths[index]}: ${errorMessage2(result.reason)}`] : []);
}
function cleanupResult(warnings) {
  return warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings };
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/promotions/_commit.ts
async function commitPromotionTargets(root4, initial, records, targets, hooks) {
  let checkpoint = initial;
  if (checkpoint.phase === "compensating") {
    return await compensate(root4, checkpoint, records, targets, checkpoint.error ?? "Resumed promotion compensation", hooks);
  }
  try {
    for (const [index, target] of targets.entries()) {
      const storedTarget = requirePreparedTarget(checkpoint.targets[index]);
      if (storedTarget.state === "restored") {
        checkpoint = await updateTarget(root4, checkpoint, index, "prepared", hooks);
      }
      if (checkpoint.targets[index].state === "prepared") {
        await hooks.beforeCommit?.(target.request, index);
      }
      await applyMutation({
        target: storedTarget,
        hashes: { beforeHash: beforeHash(storedTarget), afterHash: storedTarget.afterHash },
        state: requirePreparedTarget(checkpoint.targets[index]).state,
        boundaryPrefix: `promotion:${index}`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root4, checkpoint, index, state, hooks, boundary);
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root4, { operationId: checkpoint.operationId, kind: "promote", phase: "committed", evidence: records[index] });
    }
  } catch (error) {
    return await compensate(root4, checkpoint, records, targets, error, hooks);
  }
  const pending = {
    promotionId: checkpoint.promotionId,
    operationId: checkpoint.operationId,
    candidateId: checkpoint.candidateId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    targets: records,
    result: "applied",
    cleanup: { status: "pending" }
  };
  await writePromotionRecord(root4, pending);
  const warnings = await cleanupPromotionPaths("applied", checkpoint.targets.map((target) => target.displacedPath), hooks);
  const promotion = { ...pending, cleanup: cleanupResult(warnings) };
  try {
    await writePromotionRecord(root4, promotion);
  } catch (error) {
    await appendCleanupWarning(root4, checkpoint.operationId, {
      promotionId: checkpoint.promotionId,
      cleanup: promotion.cleanup,
      recordError: errorMessage3(error)
    });
    checkpoint = await completeOperation(root4, checkpoint, "applied");
    return { promotion: pending, checkpoint };
  }
  checkpoint = await completeOperation(root4, checkpoint, "applied");
  try {
    await appendEvent(root4, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "completed",
      evidence: { promotionId: checkpoint.promotionId, result: "applied", cleanup: promotion.cleanup }
    });
  } catch {
  }
  return { promotion, checkpoint };
}
async function compensate(root4, initial, records, targets, cause, hooks) {
  let checkpoint = {
    ...initial,
    phase: "compensating",
    recoveryAction: `skillloom resume ${initial.operationId} --yes`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeOperation(root4, checkpoint);
  try {
    await appendEvent(root4, { operationId: checkpoint.operationId, kind: "promote", phase: "compensating", error: errorMessage3(cause) });
  } catch {
  }
  try {
    for (let index = checkpoint.targets.length - 1; index >= 0; index -= 1) {
      const storedTarget = requirePreparedTarget(checkpoint.targets[index]);
      await revertMutation({
        target: storedTarget,
        hashes: { beforeHash: beforeHash(storedTarget), afterHash: storedTarget.afterHash },
        state: storedTarget.state,
        boundaryPrefix: `promotion:${index}:compensation`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget(root4, checkpoint, index, state, hooks, boundary, "compensating");
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root4, {
        operationId: checkpoint.operationId,
        kind: "promote",
        phase: "compensated",
        evidence: { target: targets[index].request.adapter.name, destination: targets[index].destination }
      });
    }
  } catch (error) {
    await appendFailure(root4, checkpoint.operationId, error);
    throw new PromotionTransactionError(`Promotion failed and compensation failed: ${errorMessage3(error)}`);
  }
  const warnings = await cleanupPromotionPaths("compensated", checkpoint.targets.map((target) => target.stagePath), hooks);
  const promotion = {
    promotionId: checkpoint.promotionId,
    operationId: checkpoint.operationId,
    candidateId: checkpoint.candidateId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    targets: records,
    result: "compensated",
    error: errorMessage3(cause),
    cleanup: cleanupResult(warnings)
  };
  await writePromotionRecord(root4, promotion);
  checkpoint = await completeOperation(root4, checkpoint, "compensated", errorMessage3(cause));
  try {
    await appendEvent(root4, {
      operationId: checkpoint.operationId,
      kind: "promote",
      phase: "completed",
      evidence: { promotionId: checkpoint.promotionId, result: "compensated", cleanup: promotion.cleanup }
    });
  } catch {
  }
  return { promotion, checkpoint };
}
async function updateTarget(root4, checkpoint, index, state, hooks, boundary, phase = "committing") {
  const targets = checkpoint.targets.map((target, targetIndex) => targetIndex === index ? transitionTarget(target, state) : target);
  const updated = {
    ...checkpoint,
    phase,
    status: "in-progress",
    recoveryAction: `skillloom resume ${checkpoint.operationId} --yes`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    targets
  };
  await writeOperation(root4, updated);
  if (boundary) {
    await hooks.afterDurableBoundary?.(boundary);
  }
  return updated;
}
function transitionTarget(target, state) {
  if (!target.before) {
    throw new ValidationError(`Promotion before-state is missing: ${target.destination}`);
  }
  return { ...target, before: target.before, state };
}
function requirePreparedTarget(target) {
  if (!target.before) {
    throw new ValidationError(`Promotion target is not prepared: ${target.destination}`);
  }
  return target;
}
function beforeHash(target) {
  return target.before.kind === "present" ? target.before.hash : null;
}
async function completeOperation(root4, checkpoint, phase, error) {
  const completed = {
    ...checkpoint,
    phase,
    status: "completed",
    recoveryAction: "None",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error
  };
  await writeOperation(root4, completed);
  return completed;
}
async function appendFailure(root4, operationId, error) {
  try {
    await appendEvent(root4, { operationId, kind: "promote", phase: "failed", error: errorMessage3(error) });
  } catch {
  }
}
async function appendCleanupWarning(root4, operationId, evidence) {
  try {
    await appendEvent(root4, { operationId, kind: "promote", phase: "cleanup-warning", evidence });
  } catch {
  }
}
function errorMessage3(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/promotions/_policy.ts
import { join as join17 } from "node:path";
async function verifyPromotionCandidate(root4, candidateId) {
  const candidate2 = await readCandidate(root4, candidateId);
  if (!isModeAwarePackageHash(candidate2.packageHash)) {
    throw new ValidationError("Legacy candidate must be recaptured before promotion");
  }
  const canonical = join17(storeLayout(root4).candidates, candidateId, "skill");
  const validation = await validateSkillPackage(canonical, {
    expectedName: candidate2.metadata.name,
    expectedHash: candidate2.packageHash
  });
  if (candidate2.packageHash !== validation.packageHash) {
    throw new ValidationError("Candidate package hash does not match canonical snapshot");
  }
  if (JSON.stringify(candidate2.findings) !== JSON.stringify(validation.findings)) {
    throw new ValidationError("Candidate trust findings do not match canonical snapshot");
  }
  return { canonical, validation, candidate: candidate2 };
}
function assertPromotionFindings(findings, acceptWarnings) {
  if (findings.some((finding2) => finding2.severity === "danger")) {
    throw new PromotionPolicyError("Danger findings block promotion");
  }
  if (!acceptWarnings && findings.some((finding2) => finding2.severity === "warning")) {
    throw new PromotionPolicyError("Warning findings require --accept-warnings");
  }
}

// src/promotions/_prepare.ts
import { basename as basename4, join as join18 } from "node:path";
async function stagePromotionTargets(root4, operationId, canonical, expectedHash, targets, hooks) {
  for (const [index, target] of targets.entries()) {
    await hooks.beforeStage?.(target.request, index);
    const stagedHash = await stageCanonicalSkill(canonical, target.stagePath, expectedHash);
    if (stagedHash !== expectedHash) {
      throw new ValidationError(`Staged package hash mismatch for ${target.request.adapter.name}`);
    }
    await appendEvent(root4, {
      operationId,
      kind: "promote",
      phase: "staged",
      evidence: { target: target.request.adapter.name, scope: target.scope, destination: target.destination, stagePath: target.stagePath, packageHash: stagedHash }
    });
  }
}
async function backupPromotionTargets(root4, operationId, promotionId, afterHash, targets, hooks, expectedBaseHash) {
  const records = [];
  for (const [index, target] of targets.entries()) {
    await hooks.beforeBackup?.(target.request, index);
    const before = await backupTarget(root4, promotionId, index, target, expectedBaseHash);
    const record = {
      target: target.request.adapter.name,
      scope: target.scope,
      destination: target.destination,
      before,
      afterHash
    };
    records.push(record);
    await appendEvent(root4, { operationId, kind: "promote", phase: "backed-up", evidence: record });
  }
  return records;
}
async function cleanupPreparation(root4, promotionId, targets, hooks) {
  return await cleanupPromotionPaths("preparation", [
    ...targets.flatMap((target) => [target.stagePath, target.displacedPath]),
    join18(storeLayout(root4).backups, promotionId)
  ], hooks);
}
async function backupTarget(root4, promotionId, index, target, expectedBaseHash) {
  if (!await pathExists(target.destination)) {
    return { kind: "absent" };
  }
  const hash2 = await hashSkillDirectory(target.destination, expectedBaseHash);
  if (expectedBaseHash && hash2 !== expectedBaseHash) {
    throw new ValidationError(`Installed base hash mismatch for ${target.request.adapter.name}`);
  }
  const backupPath = join18(storeLayout(root4).backups, promotionId, `${index}-${target.request.adapter.name}-${target.scope}`, basename4(target.destination));
  const backupHash = await backupSkill(target.destination, backupPath, hash2);
  if (backupHash !== hash2) {
    throw new ValidationError(`Backup hash mismatch for ${target.request.adapter.name}`);
  }
  return { kind: "present", hash: hash2, backupPath };
}

// src/promotions/_targets.ts
import { basename as basename5, dirname as dirname8, isAbsolute as isAbsolute3, join as join19, relative as relative3, resolve as resolve7 } from "node:path";
async function resolvePromotionTargets(context, skillName2, targets, promotionId) {
  const resolvedTargets = await Promise.all(targets.map(async (request) => {
    const scoped = "scope" in request;
    let destination;
    if (scoped) {
      const lexicalDestination = resolve7(request.adapter.resolveDestination(context, request.scope, skillName2));
      destination = await canonicalizeFuturePath(lexicalDestination);
    } else {
      const lexicalRoot = resolve7(request.adapter.resolveRoot(context, request.destinationRoot));
      const physicalRoot = await canonicalizeGenericRoot(context, request.destinationRoot, lexicalRoot);
      destination = resolveSkillDestination(physicalRoot, skillName2);
    }
    const temporaryPrefix = `.${basename5(destination)}.skillloom-${promotionId}`;
    return {
      request,
      scope: scoped ? request.scope : "explicit",
      destination,
      stagePath: join19(dirname8(destination), `${temporaryPrefix}.stage`),
      displacedPath: join19(dirname8(destination), `${temporaryPrefix}.previous`)
    };
  }));
  return resolvedTargets.sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}
function assertSafeDestinations(storeRoot, targets) {
  for (const [index, target] of targets.entries()) {
    if (isWithin2(storeRoot, target.destination)) {
      throw new PromotionPolicyError(`Destination cannot be inside the Skillloom store: ${target.destination}`);
    }
    const overlaps = targets.some((other, otherIndex) => otherIndex !== index && (isWithin2(target.destination, other.destination) || isWithin2(other.destination, target.destination)));
    if (overlaps) {
      throw new PromotionPolicyError(`Promotion destinations overlap: ${target.destination}`);
    }
  }
}
function targetKey(target) {
  return `${target.request.adapter.name}\0${target.scope}\0${target.destination}`;
}
function isWithin2(parent, child) {
  const path = relative3(resolve7(parent), resolve7(child));
  return path === "" || !path.startsWith("..") && !isAbsolute3(path);
}

// src/promotions/_base-policy.ts
import { realpath as realpath3 } from "node:fs/promises";
async function assertBaseState(base, destinations) {
  if (base.kind === "none") {
    return;
  }
  try {
    if (await realpath3(base.path) !== base.path || await hashSkillDirectory(base.path, base.hash) !== base.hash) {
      throw new PromotionPolicyError(`Captured base path hash mismatch at ${base.path}`);
    }
  } catch (error) {
    if (error instanceof PromotionPolicyError) {
      throw error;
    }
    throw new PromotionPolicyError(`Captured base path hash mismatch at ${base.path}`);
  }
  for (const destination of destinations) {
    if (await pathExists(destination) && await hashSkillDirectory(destination, base.hash) !== base.hash) {
      throw new PromotionPolicyError(`Installed base hash mismatch at ${destination}`);
    }
  }
}
async function assertResumeBaseState(base, targets, observations) {
  if (base.kind === "none") {
    return;
  }
  const canonicalBasePath = await canonicalizeFuturePath(base.path);
  const matchingTargets = [];
  for (const target2 of targets) {
    if (await canonicalizeFuturePath(target2.destination) === canonicalBasePath) {
      matchingTargets.push(target2);
    }
  }
  if (matchingTargets.length === 0) {
    await assertBaseState(base, []);
    return;
  }
  if (matchingTargets.length !== 1) {
    throw baseMismatch(base.path);
  }
  const target = matchingTargets[0];
  if (!target.before || target.before.kind !== "present" || target.before.hash !== base.hash) {
    throw baseMismatch(base.path);
  }
  const observation = observations.get(target.destination);
  if (!observation) {
    throw baseMismatch(base.path);
  }
  if (observation.layout === "prepared") {
    await assertBaseState(base, []);
  }
}
function baseMismatch(path) {
  return new PromotionPolicyError(`Captured base path hash mismatch at ${path}`);
}

// src/promotions/_promotion-failure.ts
async function failPromotionCheckpoint(root4, checkpoint, error) {
  await writeOperation(root4, {
    ...checkpoint,
    status: "failed",
    recoveryAction: "Inspect recovery evidence before starting a new promotion",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: errorMessage4(error)
  });
}
async function recordPromotionFailure(root4, operationId, error, cleanupWarnings = []) {
  const primaryError = errorMessage4(error);
  await appendEvent(root4, {
    operationId,
    kind: "promote",
    phase: "failed",
    evidence: { primaryError, cleanupWarnings },
    error: primaryError
  });
}
function errorMessage4(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/policy/evaluate.ts
function evaluateAutoPromotion(config, request) {
  const reasons = [];
  const totalBytes = request.files.reduce((total, file2) => total + file2.size, 0);
  if (config.mode === "manual") {
    reasons.push("manual mode requires explicit approval");
  }
  const deniedScopes = request.scopes.filter((scope) => scope !== config.policy.scope);
  if (deniedScopes.length > 0) {
    reasons.push(`scopes are outside the ${config.policy.scope} policy: ${[...new Set(deniedScopes)].join(",")}`);
  }
  const deniedTargets = request.targets.filter((target) => !config.policy.targets.some((allowed) => allowed === target));
  if (deniedTargets.length > 0) {
    reasons.push(`targets are outside policy: ${deniedTargets.join(",")}`);
  }
  const allowedCapabilities = config.policy.allowedCapabilities ?? [];
  const deniedCapabilities = (request.capabilities ?? []).filter((capability2) => !allowedCapabilities.includes(capability2));
  if (deniedCapabilities.length > 0) {
    reasons.push(`capabilities are outside policy: ${deniedCapabilities.join(",")}`);
  }
  if (request.files.length > config.policy.maxFiles) {
    reasons.push(`file count ${request.files.length} exceeds ${config.policy.maxFiles}`);
  }
  if (totalBytes > config.policy.maxTotalBytes) {
    reasons.push(`package size ${totalBytes} exceeds ${config.policy.maxTotalBytes}`);
  }
  if (!config.policy.allowExecutables && request.files.some((file2) => (file2.mode & 73) !== 0)) {
    reasons.push("executable files are not allowed by policy");
  }
  if (request.dangers > 0) {
    reasons.push("danger findings always block promotion");
  }
  if (!config.policy.allowWarnings && request.warnings > 0) {
    reasons.push("warning findings are not allowed by policy");
  }
  return {
    approved: reasons.length === 0,
    mode: config.mode,
    candidateId: request.candidateId,
    packageHash: request.packageHash,
    reasons,
    evaluatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/policy/workflow-proof.ts
function authoritativeWorkflowProofError(storedProof, callerProof, candidate2, provenance2 = []) {
  if (storedProof !== void 0) {
    const storedError = workflowProofError(storedProof, candidate2, provenance2);
    if (storedError !== null) return storedError;
    return callerProof !== void 0 && !sameWorkflowProof(storedProof, callerProof) ? "workflow proof override conflicts with stored candidate proof" : null;
  }
  return callerProof === void 0 ? null : workflowProofError(callerProof, candidate2, provenance2);
}
function assertAuthoritativeWorkflowProof(storedProof, callerProof, candidate2, provenance2 = []) {
  const reason = authoritativeWorkflowProofError(storedProof, callerProof, candidate2, provenance2);
  if (reason !== null) throw new PromotionPolicyError(reason);
}
function workflowProofError(proof, candidate2, provenance2 = []) {
  if (proof.verdict !== "passed") return "workflow proof did not pass";
  if (proof.candidate.candidateId !== candidate2.candidateId || proof.candidate.packageHash !== candidate2.packageHash) {
    return "workflow proof is not bound to the candidate package";
  }
  if (provenance2.length > 0 && !provenance2.some((item) => item.artifactId === proof.workflow.artifactId && item.revision === proof.workflow.revision && item.contentHash === proof.workflow.contentHash)) {
    return "workflow proof is not bound to registry provenance";
  }
  return null;
}
function sameWorkflowProof(left, right) {
  return left.schemaVersion === right.schemaVersion && left.decisionId === right.decisionId && left.idempotencyKey === right.idempotencyKey && left.verdict === right.verdict && left.workflow.artifactId === right.workflow.artifactId && left.workflow.revision === right.workflow.revision && left.workflow.contentHash === right.workflow.contentHash && left.candidate.candidateId === right.candidate.candidateId && left.candidate.packageHash === right.candidate.packageHash && left.verifier.kind === right.verifier.kind && left.verifier.summary === right.verifier.summary && left.verifier.evidence === right.verifier.evidence && left.decidedAt === right.decidedAt && sameStrings(left.provenanceHashes, right.provenanceHashes);
}
function sameStrings(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

// src/promotions/service.ts
async function promoteCandidate(context, candidateId, targets, approval, hooks = {}) {
  const policyApproval = approval.kind === "policy";
  if (!policyApproval && !approval.yes) {
    throw new PromotionPolicyError("Promotion requires explicit approval with --yes");
  }
  if (targets.length === 0) {
    throw new PromotionPolicyError("Promotion requires at least one target");
  }
  const config = await ensureConfig(context.projectRoot);
  const { canonical, validation, candidate: candidate2 } = await verifyPromotionCandidate(context.projectRoot, candidateId);
  if (policyApproval) {
    const decision = evaluateAutoPromotion(config, {
      candidateId,
      packageHash: validation.packageHash,
      targets: targets.map((target) => target.adapter.name),
      scopes: targets.map((target) => "scope" in target ? target.scope : "explicit"),
      files: validation.files,
      warnings: validation.findings.filter((finding2) => finding2.severity === "warning").length,
      dangers: validation.findings.filter((finding2) => finding2.severity === "danger").length,
      capabilities: validation.metadata.capabilities ?? []
    });
    await appendEvent(context.projectRoot, {
      operationId: `op-policy-${randomUUID6()}`,
      kind: "policy",
      phase: decision.approved ? "completed" : "failed",
      evidence: decision,
      ...decision.approved ? {} : { error: decision.reasons.join("; ") }
    });
    if (!decision.approved) {
      throw new PromotionPolicyError(`Automatic promotion quarantined: ${decision.reasons.join("; ")}`);
    }
  } else {
    assertPromotionFindings(validation.findings, approval.acceptWarnings);
  }
  assertAuthoritativeWorkflowProof(candidate2.governedWorkflowProof, approval.workflowProof, {
    candidateId,
    packageHash: validation.packageHash
  });
  const operationId = `op-promote-${randomUUID6()}`;
  const promotionId = `promo-${randomUUID6()}`;
  const resolvedTargets = await resolvePromotionTargets(context, validation.metadata.name, targets, promotionId);
  const canonicalStoreRoot = await canonicalizeFuturePath(storeLayout(context.projectRoot).root);
  assertSafeDestinations(canonicalStoreRoot, resolvedTargets);
  return await withStoreLock(context.projectRoot, async () => {
    const base = candidate2.base ?? { kind: "none" };
    await assertBaseState(base, resolvedTargets.map((target) => target.destination));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let checkpoint = {
      kind: "promote",
      operationId,
      promotionId,
      candidateId,
      candidateHash: validation.packageHash,
      createdAt: now,
      updatedAt: now,
      status: "in-progress",
      phase: "intent",
      recoveryAction: "Preparation has not reached a resumable checkpoint",
      targets: resolvedTargets.map((target) => ({
        target: target.request.adapter.name,
        scope: target.scope,
        destination: target.destination,
        stagePath: target.stagePath,
        displacedPath: target.displacedPath,
        afterHash: validation.packageHash,
        before: null,
        state: "intent"
      }))
    };
    await appendEvent(context.projectRoot, { operationId, kind: "promote", phase: "started", evidence: { promotionId, candidateId } });
    await appendEvent(context.projectRoot, {
      operationId,
      kind: "promote",
      phase: "candidate-verified",
      evidence: { candidateId, packageHash: validation.packageHash }
    });
    await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
    let records;
    try {
      checkpoint = { ...checkpoint, phase: "staging", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeOperation(context.projectRoot, checkpoint);
      await stagePromotionTargets(context.projectRoot, operationId, canonical, validation.packageHash, resolvedTargets, hooks);
      checkpoint = {
        ...checkpoint,
        phase: "staged",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        targets: checkpoint.targets.map((target) => ({ ...target, state: "staged", before: null }))
      };
      await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
      checkpoint = { ...checkpoint, phase: "backing-up", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeOperation(context.projectRoot, checkpoint);
      records = await backupPromotionTargets(
        context.projectRoot,
        operationId,
        promotionId,
        validation.packageHash,
        resolvedTargets,
        hooks,
        base.kind === "installed" ? base.hash : void 0
      );
      checkpoint = {
        ...checkpoint,
        phase: "prepared",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        recoveryAction: `skillloom resume ${operationId} --yes`,
        targets: checkpoint.targets.map((target, index) => ({ ...target, state: "prepared", before: records[index].before }))
      };
      await persistPromotionCheckpoint(context.projectRoot, checkpoint, hooks);
    } catch (error) {
      if (error instanceof OperationInterruptedError) {
        throw error;
      }
      let cleanupWarnings = [];
      try {
        cleanupWarnings = await cleanupPreparation(context.projectRoot, promotionId, resolvedTargets, hooks);
      } catch (cleanupError) {
        cleanupWarnings = [`preparation cleanup failed: ${errorMessage4(cleanupError)}`];
      }
      await failPromotionCheckpoint(context.projectRoot, checkpoint, error);
      try {
        await recordPromotionFailure(context.projectRoot, operationId, error, cleanupWarnings);
      } catch {
      }
      throw error;
    }
    const result = await commitPromotionTargets(context.projectRoot, checkpoint, records, resolvedTargets, hooks);
    return result.promotion;
  }, { operationId, context: "promote" });
}

// src/commands/promote.ts
async function promoteCommand(command, projectRoot = process.cwd(), homeDir = homedir()) {
  const targets = command.targetMode === "directory" ? [{ adapter: getGenericAdapter(), destinationRoot: command.destinationRoot }] : command.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: command.scope }));
  const result = await promoteCandidate(
    { projectRoot, homeDir },
    command.candidateId,
    targets,
    command.policy ? { kind: "policy" } : { yes: command.yes, acceptWarnings: command.acceptWarnings }
  );
  if (result.result === "compensated") {
    throw new PromotionTransactionError(`Promotion ${result.promotionId} was compensated: ${result.error}`);
  }
  return result;
}

// src/commands/doctor.ts
import { homedir as homedir2 } from "node:os";
async function doctorCommand(command, projectRoot = process.cwd(), homeDir = homedir2(), executableSearchPath = process.env.PATH ?? "") {
  const checks = [];
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

// src/store/journal-lock-recovery.ts
import { lstat as lstat5, mkdir as mkdir11, rename as rename5 } from "node:fs/promises";
import { join as join20 } from "node:path";
async function recoverStaleJournalLock(root4, expectedOperationId) {
  const journal = await inspectJournal(root4);
  if (journal.health.state !== "healthy") {
    throw new LockError(`Journal lock recovery requires a healthy journal: ${journal.health.state}`);
  }
  const diagnostic = await readJournalLockDiagnostic(root4);
  if (diagnostic.state !== "stale") {
    throw new LockError(`Journal lock is ${diagnostic.state}, not stale`);
  }
  if (expectedOperationId && diagnostic.operationId !== expectedOperationId) {
    throw new LockError(`Journal lock belongs to ${diagnostic.operationId ?? "an unknown operation"}, not ${expectedOperationId}`);
  }
  const layout = storeLayout(root4);
  const archiveRoot = join20(layout.root, "stale-locks", "journal");
  await mkdir11(archiveRoot, { recursive: true });
  const archivedPath = await nextArchivePath(archiveRoot, `${diagnostic.operationId ?? "unknown"}-${Date.now()}`);
  await rename5(layout.journalLock, archivedPath);
  await syncDirectory(layout.root);
  await syncDirectory(archiveRoot);
  return { archivedPath, owner: diagnostic };
}
async function nextArchivePath(root4, name) {
  for (let suffix = 0; ; suffix += 1) {
    const path = join20(root4, suffix === 0 ? name : `${name}-${suffix}`);
    try {
      await lstat5(path);
    } catch (error) {
      if (errorCode6(error) === "ENOENT") {
        return path;
      }
      throw error;
    }
  }
}
function errorCode6(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/promotions/_resume-validation.ts
import { basename as basename6, dirname as dirname9, join as join21 } from "node:path";
async function verifyResumeCheckpoint(root4, checkpoint) {
  const { validation, candidate: candidate2 } = await verifyPromotionCandidate(root4, checkpoint.candidateId);
  assertPromotionFindings(validation.findings, true);
  if (validation.packageHash !== checkpoint.candidateHash) {
    throw new ValidationError("Resume candidate hash mismatch");
  }
  if (checkpoint.targets.length === 0) {
    throw new ValidationError("Resume checkpoint has no targets");
  }
  const targets = checkpoint.targets.map(toResolvedTarget);
  const canonicalStoreRoot = await canonicalizeFuturePath(storeLayout(root4).root);
  assertSafeDestinations(canonicalStoreRoot, targets);
  await verifyJournalEvidence(root4, checkpoint);
  const observations = /* @__PURE__ */ new Map();
  for (const target of checkpoint.targets) {
    observations.set(target.destination, await verifyTarget(target, checkpoint.promotionId));
  }
  await assertResumeBaseState(candidate2.base ?? { kind: "none" }, checkpoint.targets, observations);
  return checkpoint;
}
function toResumeRecord(target) {
  if (!target.before) {
    throw new ValidationError(`Resume before-state is missing: ${target.destination}`);
  }
  return { target: target.target, scope: target.scope, destination: target.destination, before: target.before, afterHash: target.afterHash };
}
function toResolvedTarget(target) {
  const request = target.target === "generic" ? { adapter: getGenericAdapter(), destinationRoot: dirname9(target.destination) } : { adapter: getScopedAdapter(target.target), scope: target.scope === "user" ? "user" : "project" };
  return { request, scope: target.scope, destination: target.destination, stagePath: target.stagePath, displacedPath: target.displacedPath };
}
async function verifyJournalEvidence(root4, checkpoint) {
  const events = (await readEvents(root4)).filter((event) => event.operationId === checkpoint.operationId);
  const staged = events.filter((event) => event.kind === "promote" && event.phase === "staged").map((event) => event.evidence);
  const backedUp = events.filter((event) => event.kind === "promote" && event.phase === "backed-up").map((event) => event.evidence);
  const expectedStages = checkpoint.targets.map((target) => ({
    target: target.target,
    scope: target.scope,
    destination: target.destination,
    stagePath: target.stagePath,
    packageHash: target.afterHash
  }));
  if (JSON.stringify(staged) !== JSON.stringify(expectedStages) || JSON.stringify(backedUp) !== JSON.stringify(checkpoint.targets.map(toResumeRecord))) {
    throw new ValidationError("Resume checkpoint does not agree with journal evidence");
  }
}
async function verifyTarget(target, promotionId) {
  if (!target.before) {
    throw new ValidationError(`Resume before-state is missing: ${target.destination}`);
  }
  const prefix = `.${basename6(target.destination)}.skillloom-${promotionId}`;
  if (target.stagePath !== join21(dirname9(target.destination), `${prefix}.stage`) || target.displacedPath !== join21(dirname9(target.destination), `${prefix}.previous`)) {
    throw new ValidationError(`Resume temporary path mismatch: ${target.destination}`);
  }
  if (target.before.kind === "present") {
    if (!await pathExists(target.before.backupPath) || await hashSkillDirectory(target.before.backupPath, target.before.hash) !== target.before.hash) {
      throw new ValidationError(`Resume backup hash mismatch: ${target.destination}`);
    }
  }
  if (await pathExists(target.stagePath) && await hashSkillDirectory(target.stagePath, target.afterHash) !== target.afterHash) {
    throw new ValidationError(`Resume staged hash mismatch: ${target.destination}`);
  }
  return await observeMutation(target, {
    beforeHash: target.before.kind === "present" ? target.before.hash : null,
    afterHash: target.afterHash
  }, target.state);
}

// src/promotions/_resume-record.ts
async function recoverRecordedPromotion(root4, checkpoint) {
  let record;
  try {
    record = await readPromotion(root4, checkpoint.promotionId);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (record.operationId !== checkpoint.operationId || record.candidateId !== checkpoint.candidateId || JSON.stringify(record.targets) !== JSON.stringify(checkpoint.targets.map(toResumeRecord))) {
    throw new ValidationError("Recorded promotion does not agree with the resume checkpoint");
  }
  if (record.result === "applied") {
    for (const target of record.targets) {
      if (!await pathExists(target.destination) || await hashSkillDirectory(target.destination, target.afterHash) !== target.afterHash) {
        throw new ValidationError(`Recorded promotion active hash mismatch: ${target.destination}`);
      }
    }
    if (record.cleanup.status === "pending") {
      const warnings = [];
      for (const target of checkpoint.targets) {
        try {
          await discardPromotionPath(target.displacedPath);
        } catch (error) {
          warnings.push(`${target.displacedPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      record = { ...record, cleanup: warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings } };
      await writePromotionRecord(root4, record);
    }
  }
  await writeOperation(root4, {
    ...checkpoint,
    phase: record.result === "compensated" ? "compensated" : "applied",
    status: "completed",
    recoveryAction: "None",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await appendEvent(root4, {
    operationId: checkpoint.operationId,
    kind: "resume",
    phase: "completed",
    evidence: { promotionId: checkpoint.promotionId, recoveredRecord: record.result }
  });
  return record;
}

// src/promotions/_rollback-resume.ts
import { basename as basename7, dirname as dirname10, join as join22 } from "node:path";

// src/promotions/_rollback-cleanup.ts
async function cleanupRollbackPaths(paths) {
  const warnings = [];
  for (const path of paths) {
    try {
      await discardPromotionPath(path);
    } catch (error) {
      warnings.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return warnings;
}
function rollbackCleanupResult(warnings) {
  return warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings };
}

// src/promotions/_rollback-transaction.ts
async function commitRollbackTargets(root4, promotion, initial, hooks) {
  let checkpoint = initial;
  if (checkpoint.phase === "compensating") {
    await compensateRollback(root4, checkpoint, hooks, checkpoint.error ?? "Resumed rollback compensation");
    throw new PromotionTransactionError(`Rollback failed and was compensated: ${checkpoint.error ?? "resumed failure"}`);
  }
  try {
    for (const [index, target] of checkpoint.targets.entries()) {
      if (target.state === "restored") {
        checkpoint = await updateTarget2(root4, checkpoint, index, "prepared", hooks);
      }
      if (checkpoint.targets[index].state === "prepared") {
        await hooks.beforeCommit?.(target.destination, index);
      }
      await applyMutation({
        target,
        hashes: mutationHashes(target),
        state: checkpoint.targets[index].state,
        boundaryPrefix: `rollback:${index}`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget2(root4, checkpoint, index, state, hooks, boundary);
        },
        afterBoundary: hooks.afterDurableBoundary
      });
      await appendEvent(root4, {
        operationId: checkpoint.operationId,
        kind: "rollback",
        phase: "committed",
        evidence: { destination: target.destination, before: target.before }
      });
    }
  } catch (error) {
    await compensateRollback(root4, checkpoint, hooks, error);
    throw new PromotionTransactionError(`Rollback failed and was compensated: ${errorMessage5(error)}`);
  }
  const pending = {
    ...promotion,
    result: "rolled-back",
    rollbackOperationId: checkpoint.operationId,
    rolledBackAt: (/* @__PURE__ */ new Date()).toISOString(),
    forced: checkpoint.force,
    cleanup: { status: "pending" }
  };
  await writePromotionRecord(root4, pending);
  const warnings = await cleanupRollbackPaths(checkpoint.targets.map((target) => target.displacedPath));
  const result = { ...pending, cleanup: rollbackCleanupResult(warnings) };
  await writePromotionRecord(root4, result);
  checkpoint = await completeRollback(root4, checkpoint, "rolled-back");
  await appendEvent(root4, {
    operationId: checkpoint.operationId,
    kind: "rollback",
    phase: "completed",
    evidence: { promotionId: checkpoint.promotionId, cleanup: result.cleanup }
  });
  return { promotion: result, checkpoint };
}
async function compensateRollback(root4, initial, hooks, cause) {
  let checkpoint = {
    ...initial,
    phase: "compensating",
    recoveryAction: `skillloom resume ${initial.operationId} --yes`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: errorMessage5(cause)
  };
  await writeOperation(root4, checkpoint);
  try {
    for (let index = checkpoint.targets.length - 1; index >= 0; index -= 1) {
      const target = checkpoint.targets[index];
      await revertMutation({
        target,
        hashes: mutationHashes(target),
        state: target.state,
        boundaryPrefix: `rollback:${index}:compensation`,
        transition: async (state, boundary) => {
          checkpoint = await updateTarget2(root4, checkpoint, index, state, hooks, boundary, "compensating");
        },
        afterBoundary: hooks.afterDurableBoundary
      });
    }
  } catch (error) {
    await appendEvent(root4, { operationId: checkpoint.operationId, kind: "rollback", phase: "failed", error: errorMessage5(error) });
    throw new PromotionTransactionError(`Rollback failed and compensation failed: ${errorMessage5(error)}`);
  }
  await cleanupRollbackPaths(checkpoint.targets.flatMap((target) => target.stagePath ? [target.stagePath] : []));
  checkpoint = await completeRollback(root4, checkpoint, "compensated", errorMessage5(cause));
  await appendEvent(root4, { operationId: checkpoint.operationId, kind: "rollback", phase: "compensated", error: errorMessage5(cause) });
  return checkpoint;
}
async function updateTarget2(root4, checkpoint, index, state, hooks, boundary, phase = "committing") {
  const target = checkpoint.targets[index];
  if (!target) {
    throw new ValidationError(`Rollback target ${index} is missing`);
  }
  const updated = {
    ...checkpoint,
    phase,
    status: "in-progress",
    recoveryAction: `skillloom resume ${checkpoint.operationId} --yes`,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    targets: checkpoint.targets.map((item, targetIndex) => targetIndex === index ? { ...item, state } : item)
  };
  await writeOperation(root4, updated);
  if (boundary) {
    await hooks.afterDurableBoundary?.(boundary);
  }
  return updated;
}
function mutationHashes(target) {
  return {
    beforeHash: target.activeHash,
    afterHash: target.before.kind === "present" ? target.before.hash : null
  };
}
async function completeRollback(root4, checkpoint, phase, error) {
  const completed = {
    ...checkpoint,
    phase,
    status: "completed",
    recoveryAction: "None",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error
  };
  await writeOperation(root4, completed);
  return completed;
}
function errorMessage5(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/promotions/_rollback-resume.ts
async function resumeRollback(root4, stored) {
  const promotion = await readPromotion(root4, stored.promotionId);
  if (promotion.result === "rolled-back") {
    return promotion;
  }
  if (promotion.result !== "applied") {
    throw new PromotionPolicyError(`Rollback cannot resume from promotion result ${promotion.result}`);
  }
  await verifyRollbackCheckpoint(stored, promotion);
  try {
    return (await commitRollbackTargets(root4, promotion, stored, {})).promotion;
  } catch (error) {
    if (stored.phase === "compensating" && error instanceof PromotionTransactionError) {
      const operation = await readOperation(root4, stored.operationId);
      if (operation.kind === "rollback" && operation.status === "completed" && operation.phase === "compensated") {
        return await readPromotion(root4, stored.promotionId);
      }
    }
    throw error;
  }
}
async function verifyRollbackCheckpoint(checkpoint, promotion) {
  if (checkpoint.targets.length !== promotion.targets.length) {
    throw new ValidationError("Rollback resume target count mismatch");
  }
  for (const [index, target] of checkpoint.targets.entries()) {
    const record = promotion.targets[index];
    if (!record || record.destination !== target.destination || record.afterHash !== target.afterHash || JSON.stringify(record.before) !== JSON.stringify(target.before)) {
      throw new ValidationError(`Rollback resume evidence mismatch at target ${index}`);
    }
    const prefix = `.${basename7(target.destination)}.skillloom-${checkpoint.operationId}`;
    const expectedStage = target.before.kind === "present" ? join22(dirname10(target.destination), `${prefix}.stage`) : null;
    if (target.stagePath !== expectedStage || target.displacedPath !== join22(dirname10(target.destination), `${prefix}.previous`)) {
      throw new ValidationError(`Rollback resume temporary path mismatch: ${target.destination}`);
    }
    if (target.before.kind === "present") {
      if (!await pathExists(target.before.backupPath) || await hashSkillDirectory(target.before.backupPath, target.before.hash) !== target.before.hash) {
        throw new ValidationError(`Rollback resume backup hash mismatch: ${target.destination}`);
      }
    }
    if (target.stagePath && await pathExists(target.stagePath) && target.before.kind === "present" && await hashSkillDirectory(target.stagePath, target.before.hash) !== target.before.hash) {
      throw new ValidationError(`Rollback resume staged hash mismatch: ${target.destination}`);
    }
    await observeMutation(target, {
      beforeHash: target.activeHash,
      afterHash: target.before.kind === "present" ? target.before.hash : null
    }, target.state);
  }
}

// src/promotions/resume.ts
async function resumePromotion(root4, operationId, yes) {
  if (!yes) {
    throw new PromotionPolicyError("Resume requires explicit approval with --yes");
  }
  const stored = await readOperation(root4, operationId);
  if (stored.kind === "capture") {
    throw new PromotionPolicyError(`Operation is not resumable: ${operationId}`);
  }
  if (stored.status === "completed") {
    return await readPromotion(root4, stored.promotionId);
  }
  if (stored.status !== "interrupted" && stored.status !== "in-progress" || !isResumablePhase(stored)) {
    throw new PromotionPolicyError(`${stored.kind} cannot resume from ${stored.status}/${stored.phase}`);
  }
  return await withRecoveryStoreLock(root4, async () => {
    const journalLock = await readJournalLockDiagnostic(root4);
    if (journalLock.state === "stale") {
      const recovery = await recoverStaleJournalLock(root4, operationId);
      await appendEvent(root4, { operationId, kind: "recovery", phase: "lock-archived", evidence: recovery });
    }
    await appendEvent(root4, {
      operationId,
      kind: "resume",
      phase: "started",
      evidence: { promotionId: stored.promotionId, resumedPhase: stored.phase, operationKind: stored.kind }
    });
    try {
      const result = stored.kind === "promote" ? await resumePromotionLocked(root4, stored) : await resumeRollback(root4, stored);
      await appendEvent(root4, {
        operationId,
        kind: "resume",
        phase: "completed",
        evidence: { promotionId: stored.promotionId, result: result.result }
      });
      return result;
    } catch (error) {
      await appendEvent(root4, {
        operationId,
        kind: "resume",
        phase: "failed",
        evidence: { recoveryAction: stored.recoveryAction },
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }, { operationId, context: `resume-${stored.kind}` });
}
async function resumePromotionLocked(root4, stored) {
  const recorded = await recoverRecordedPromotion(root4, stored);
  if (recorded) {
    return recorded;
  }
  const checkpoint = await verifyResumeCheckpoint(root4, stored);
  return (await commitPromotionTargets(
    root4,
    checkpoint,
    checkpoint.targets.map(toResumeRecord),
    checkpoint.targets.map(toResolvedTarget),
    {}
  )).promotion;
}
function isResumablePhase(operation) {
  return operation.phase === "prepared" || operation.phase === "committing" || operation.phase === "compensating";
}

// src/commands/resume.ts
async function resumeCommand(command, projectRoot = process.cwd()) {
  return await resumePromotion(projectRoot, command.operationId, command.yes);
}

// src/promotions/rollback.ts
import { randomUUID as randomUUID7 } from "node:crypto";

// src/promotions/_rollback-prepare.ts
import { basename as basename9, dirname as dirname11, join as join23 } from "node:path";

// src/promotions/_rollback-validation.ts
import { basename as basename8 } from "node:path";
async function verifyBackup(before, destination) {
  if (!await pathExists(before.backupPath)) {
    throw new ValidationError(`Rollback backup is missing: ${before.backupPath}`);
  }
  const validation = await validateSkillPackage(before.backupPath, {
    expectedName: basename8(destination),
    expectedHash: before.hash
  });
  if (validation.packageHash !== before.hash) {
    throw new ValidationError(`Rollback backup hash mismatch: ${before.backupPath}`);
  }
}
async function verifyRolledBackState(promotion) {
  for (const target of promotion.targets) {
    await verifyBeforeState(target.destination, target.before);
  }
}
async function verifyBeforeState(destination, before) {
  const exists3 = await pathExists(destination);
  if (before.kind === "absent") {
    if (exists3) {
      throw new ValidationError(`Rollback expected destination to be absent: ${destination}`);
    }
    return;
  }
  if (!exists3 || await hashSkillDirectory(destination, before.hash) !== before.hash) {
    throw new ValidationError(`Rollback restoration hash mismatch: ${destination}`);
  }
}
async function activeHashAt(destination, expectedHash) {
  if (!await pathExists(destination)) {
    return null;
  }
  return await hashSkillDirectory(destination, expectedHash);
}

// src/promotions/_rollback-prepare.ts
async function buildRollbackTargets(promotion, approval, operationId) {
  return await Promise.all(promotion.targets.map(async (target) => {
    const activeHash = await activeHashAt(target.destination, target.afterHash);
    if (!approval.force && activeHash !== target.afterHash) {
      throw new PromotionPolicyError(`Rollback active hash mismatch at ${target.destination}`);
    }
    const temporaryPrefix = `.${basename9(target.destination)}.skillloom-${operationId}`;
    return {
      destination: target.destination,
      stagePath: target.before.kind === "present" ? join23(dirname11(target.destination), `${temporaryPrefix}.stage`) : null,
      displacedPath: join23(dirname11(target.destination), `${temporaryPrefix}.previous`),
      afterHash: target.afterHash,
      before: target.before,
      activeHash,
      state: "prepared"
    };
  }));
}
async function stageRollbackTargets(targets) {
  for (const target of targets) {
    if (target.before.kind === "present" && target.stagePath) {
      await verifyBackup(target.before, target.destination);
      const stagedHash = await stageCanonicalSkill(target.before.backupPath, target.stagePath, target.before.hash);
      if (stagedHash !== target.before.hash) {
        throw new ValidationError(`Rollback staged hash mismatch at ${target.destination}`);
      }
    }
  }
}

// src/promotions/rollback.ts
async function rollbackPromotion(root4, promotionId, approval, hooks = {}) {
  if (!approval.yes) {
    throw new PromotionPolicyError("Rollback requires explicit approval with --yes");
  }
  const promotion = await readPromotion(root4, promotionId);
  if (promotion.result === "rolled-back") {
    await verifyRolledBackState(promotion);
    return promotion;
  }
  if (promotion.result !== "applied") {
    throw new PromotionPolicyError(`Cannot roll back a ${promotion.result} promotion`);
  }
  const operationId = `op-rollback-${randomUUID7()}`;
  return await withStoreLock(root4, async () => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const targets = await buildRollbackTargets(promotion, approval, operationId);
    let checkpoint = {
      kind: "rollback",
      operationId,
      promotionId,
      createdAt: now,
      updatedAt: now,
      status: "in-progress",
      phase: "intent",
      recoveryAction: "Preparation has not reached a resumable checkpoint",
      force: approval.force,
      targets
    };
    await writeOperation(root4, checkpoint);
    await appendEvent(root4, { operationId, kind: "rollback", phase: "started", evidence: { promotionId, force: approval.force } });
    try {
      await stageRollbackTargets(targets);
      checkpoint = {
        ...checkpoint,
        phase: "prepared",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        recoveryAction: `skillloom resume ${operationId} --yes`
      };
      await writeOperation(root4, checkpoint);
      try {
        await hooks.afterPreparedCheckpoint?.(checkpoint);
      } catch (error) {
        const message2 = errorMessage6(error);
        checkpoint = { ...checkpoint, status: "interrupted", updatedAt: (/* @__PURE__ */ new Date()).toISOString(), error: message2 };
        await writeOperation(root4, checkpoint);
        await appendEvent(root4, { operationId, kind: "rollback", phase: "interrupted", evidence: { phase: "prepared" }, error: message2 });
        throw new OperationInterruptedError(message2);
      }
    } catch (error) {
      if (error instanceof OperationInterruptedError) {
        throw error;
      }
      await cleanupRollbackPaths(targets.flatMap((target) => target.stagePath ? [target.stagePath] : []));
      await failRollback(root4, checkpoint, error);
      throw error;
    }
    return (await commitRollbackTargets(root4, promotion, checkpoint, hooks)).promotion;
  }, { operationId, context: "rollback" });
}
async function failRollback(root4, checkpoint, error) {
  const message2 = errorMessage6(error);
  await writeOperation(root4, {
    ...checkpoint,
    status: "failed",
    recoveryAction: "Preparation failed before a resumable checkpoint",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: message2
  });
  await appendEvent(root4, { operationId: checkpoint.operationId, kind: "rollback", phase: "failed", error: message2 });
}
function errorMessage6(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/commands/rollback.ts
async function rollbackCommand(command, projectRoot = process.cwd()) {
  return await rollbackPromotion(projectRoot, command.promotionId, { yes: command.yes, force: command.force });
}

// src/commands/recover-lock.ts
async function recoverLockCommand(command, root4 = process.cwd()) {
  if (!command.yes) {
    throw new PromotionPolicyError("Lock recovery requires explicit approval with --yes");
  }
  const recovery = await recoverStaleJournalLock(root4);
  await appendEvent(root4, {
    operationId: recovery.owner.operationId ?? "op-recovery-journal-lock",
    kind: "recovery",
    phase: "lock-archived",
    evidence: recovery
  });
  return recovery;
}

// src/commands/mode.ts
async function modeCommand(command, projectRoot = process.cwd()) {
  const config = command.mode ? await setMode(projectRoot, command.mode) : await ensureConfig(projectRoot);
  return { ...config, automation: modeProfileFor(config.mode) };
}

// src/commands/observe.ts
async function observeCommand(command, projectRoot = process.cwd()) {
  await ensureConfig(projectRoot);
  const event = await writeLearningEvent(projectRoot, {
    ...command,
    ...hasEpisode(command) ? { episode: episodeInput(command) } : {}
  });
  await appendEvent(projectRoot, {
    operationId: `op-${event.eventId}`,
    kind: "learn",
    phase: "completed",
    evidence: { eventId: event.eventId, source: event.source, outcome: event.outcome, candidateId: event.candidateId }
  });
  return event;
}
function hasEpisode(command) {
  return command.taskId !== void 0 || command.taskOutcome !== void 0 || (command.evidence?.length ?? 0) > 0 || (command.verifier?.length ?? 0) > 0;
}
function episodeInput(command) {
  return {
    ...command.taskId === void 0 ? {} : { taskId: command.taskId },
    host: command.source,
    ...command.taskOutcome === void 0 ? {} : { outcome: command.taskOutcome },
    evidence: (command.evidence ?? []).map(parseEvidence),
    verifierSignals: (command.verifier ?? []).map(parseVerifier)
  };
}
function parseEvidence(value) {
  const [category, ...rest] = value.split(":");
  return { category: evidenceCategory(category), summary: rest.join(":") || value };
}
function parseVerifier(value) {
  const [kind, status, ...rest] = value.split(":");
  return { kind: verifierKind(kind), status: verifierStatus(status), summary: rest.join(":") || value };
}
function evidenceCategory(value) {
  return value === "filesystem" || value === "shell" || value === "network" || value === "browser" || value === "mcp" || value === "test" || value === "build" ? value : "unknown";
}
function verifierKind(value) {
  return value === "test" || value === "typecheck" || value === "lint" || value === "build" || value === "review" ? value : "runtime";
}
function verifierStatus(value) {
  return value === "passed" || value === "failed" ? value : "unknown";
}

// src/learning/consolidation.ts
import { createHash as createHash5 } from "node:crypto";
var recurrenceThreshold = 2;
var batchLimit = 10;
async function runLearningConsolidation(root4, writer) {
  await resetProcessingConsolidationJobs(root4);
  const events = await listLearningEvents(root4);
  const proposals = await listConsolidationProposals(root4);
  const jobs = (await listConsolidationJobs(root4)).filter((job) => job.status === "pending" || retryableFailure(job)).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(0, batchLimit);
  const result = { processed: 0, completed: 0, failed: 0, proposals: [] };
  for (const job of jobs) {
    result.processed += 1;
    const processing = await markJob(root4, job, "processing");
    try {
      const proposal2 = await consolidateJob(processing, events, proposals, writer);
      if (proposal2 !== null) {
        await writeConsolidationProposal(root4, proposal2);
        result.proposals.push(proposal2);
      }
      await markJob(root4, processing, "complete");
      result.completed += 1;
    } catch (error) {
      const proposal2 = rejectedProposal(processing, [processing.eventId], [], message(error), true);
      await writeConsolidationProposal(root4, proposal2);
      await markJob(root4, processing, "failed", message(error));
      result.proposals.push(proposal2);
      result.failed += 1;
    }
  }
  return result;
}
async function consolidateJob(job, events, existing, writer) {
  const event = events.find((item) => item.eventId === job.eventId);
  if (event?.episode === void 0) return rejectedProposal(job, [job.eventId], [], "episode is missing", false);
  const related = recurringEpisodes(event.episode, events);
  if (related.length < recurrenceThreshold) return rejectedProposal(job, [event.eventId], event.episode.provenanceHashes, "recurrence threshold not met", true);
  const proposal2 = proposalFromEpisode(job, event, related, existing);
  if (proposal2 === null) return null;
  if (writer !== void 0) await writeProposalToBrain(event, proposal2, writer);
  return proposal2;
}
function proposalFromEpisode(job, event, related, existing) {
  const hashes = [...new Set(related.flatMap((item) => item.episode?.provenanceHashes ?? []))].slice(0, 16);
  const evidenceEventIds = related.map((item) => item.eventId);
  const firstCategory = event.episode?.evidence[0]?.category ?? "unknown";
  const failed = related.some((item) => item.episode?.outcome === "failure");
  const next = failed ? proposal(job, "feedback", `Recurring failure: ${firstCategory}`, `Record feedback for repeated ${firstCategory} failure. Keep future updates bounded and verifier-backed.`, "recurring failed episodes crossed threshold", false, evidenceEventIds, hashes) : event.outcome === "skill-create" || event.outcome === "skill-patch" ? proposal(job, "workflow-draft", `Workflow draft: ${firstCategory}`, `Draft a non-executable workflow from recurring ${firstCategory} successes. Promotion remains blocked until G005 validation and policy gates.`, "recurring successful procedural episodes crossed threshold", false, evidenceEventIds, hashes) : proposal(job, "heuristic", `Heuristic: ${firstCategory}`, `Prefer the recurring verified ${firstCategory} approach when similar evidence appears. Keep this as non-executable guidance.`, "recurring successful declarative episodes crossed threshold", false, evidenceEventIds, hashes);
  return repeatedRejected(existing, next) ? null : next;
}
function recurringEpisodes(episode, events) {
  const signature2 = episodeSignature(episode);
  return events.filter((event) => event.episode !== void 0 && episodeSignature(event.episode) === signature2);
}
function episodeSignature(episode) {
  const category = episode.evidence[0]?.category ?? "unknown";
  const verifier = episode.verifierSignals[0]?.kind ?? "runtime";
  return `${episode.host}:${episode.outcome}:${category}:${verifier}`;
}
function rejectedProposal(job, evidenceEventIds, hashes, reason, retryable) {
  return proposal(job, "rejected-update", "Rejected consolidation update", "The proposed consolidation was rejected and should not be repeated blindly.", reason, retryable, evidenceEventIds, hashes);
}
function proposal(job, kind, title, content, reason, retryable, evidenceEventIds, provenanceHashes2) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    proposalId: `proposal-${stableUuid(`${job.jobId}:${kind}:${reason}:${evidenceEventIds.join(",")}`)}`,
    jobId: job.jobId,
    kind,
    title,
    content,
    reason,
    retryable,
    evidenceEventIds: [...evidenceEventIds],
    provenanceHashes: [...provenanceHashes2],
    createdAt
  };
}
function repeatedRejected(existing, proposal2) {
  return proposal2.kind === "rejected-update" && existing.some((item) => item.kind === "rejected-update" && item.reason === proposal2.reason && item.evidenceEventIds.join(",") === proposal2.evidenceEventIds.join(","));
}
async function markJob(root4, job, status, lastError) {
  const next = {
    ...job,
    status,
    attempts: status === "processing" ? job.attempts + 1 : job.attempts,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...lastError === void 0 ? {} : { lastError: lastError.slice(0, 500) }
  };
  await writeConsolidationJob(root4, next);
  return next;
}
function retryableFailure(job) {
  return job.status === "failed" && job.attempts < 3;
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function stableUuid(value) {
  const hash2 = createHash5("sha256").update(value).digest("hex");
  return `${hash2.slice(0, 8)}-${hash2.slice(8, 12)}-4${hash2.slice(13, 16)}-a${hash2.slice(17, 20)}-${hash2.slice(20, 32)}`;
}

// src/commands/consolidate-learning.ts
async function consolidateLearningCommand(_command, projectRoot = process.cwd()) {
  return await runLearningConsolidation(projectRoot);
}

// src/commands/journey.ts
async function journeyCommand(_command, projectRoot = process.cwd()) {
  return {
    learning: await listLearningEvents(projectRoot),
    consolidation: {
      jobs: await listConsolidationJobs(projectRoot),
      proposals: await listConsolidationProposals(projectRoot)
    },
    candidates: await listCandidates(projectRoot),
    promotions: await listPromotions(projectRoot)
  };
}

// src/hub/brain/vocabulary.ts
var brainArtifactTypes = [
  "note",
  "fact",
  "decision",
  "source",
  "source-observation",
  "project",
  "memory",
  "claim",
  "entity",
  "concept",
  "bounded-episode",
  "workflow",
  "feedback",
  "rejected-update",
  "skill-candidate",
  "skill-release",
  "hot-context",
  "index-chunk",
  "health-report"
];
var brainArtifactLayers = [
  "evidence",
  "human-knowledge",
  "agent-knowledge",
  "workflow",
  "skill",
  "derived"
];
var brainRelationshipTypes = [
  "about",
  "belongs-to",
  "caused-by",
  "contradicts",
  "derived-from",
  "documents",
  "duplicates",
  "fills-gap",
  "mentions",
  "observed-in",
  "promoted-to",
  "proposes",
  "rejected-by",
  "supported-by",
  "supersedes",
  "validated-by"
];
function defaultBrainLayer(type) {
  if (type === "source" || type === "source-observation") return "evidence";
  if (type === "bounded-episode" || type === "memory" || type === "feedback" || type === "rejected-update") return "agent-knowledge";
  if (type === "workflow") return "workflow";
  if (type === "skill-candidate" || type === "skill-release") return "skill";
  if (type === "hot-context" || type === "index-chunk" || type === "health-report") return "derived";
  return "human-knowledge";
}

// src/hub/mcp/definitions.ts
var artifactId = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" };
var requestId = { ...artifactId };
var artifactType = { type: "string", enum: brainArtifactTypes };
var artifactLayer = { type: "string", enum: brainArtifactLayers };
var sensitivity = { type: "string", enum: ["private", "tailnet", "restricted"] };
var jsonObject = { type: "object" };
var sourceMetadata = {
  type: "object",
  properties: {
    sourceId: { type: "string", minLength: 1 },
    capturedAt: { type: "string" },
    contentHash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
    uri: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    mediaType: { type: "string", minLength: 1 },
    fetchedAt: { type: "string" },
    retrievedBy: { type: "string", minLength: 1 }
  },
  required: ["sourceId", "capturedAt", "contentHash"],
  additionalProperties: false
};
var artifactDetails = {
  anyOf: [
    { type: "object", properties: { kind: { type: "string", enum: ["none"] } }, required: ["kind"], additionalProperties: false },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["knowledge"] },
        status: { type: "string", enum: ["draft", "accepted", "disputed", "superseded"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        entities: { type: "array", items: { type: "string" } },
        concepts: { type: "array", items: { type: "string" } }
      },
      required: ["kind", "status"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["episode"] },
        taskId: { type: "string", minLength: 1 },
        hostId: { type: "string", minLength: 1 },
        startedAt: { type: "string" },
        endedAt: { type: "string" },
        outcome: { type: "string", enum: ["success", "failure", "partial", "cancelled"] }
      },
      required: ["kind", "taskId", "hostId", "startedAt", "outcome"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["workflow"] },
        trigger: { type: "string", minLength: 1 },
        steps: { type: "array", items: { type: "string" } },
        verifier: { type: "string", minLength: 1 },
        promotable: { type: "boolean" }
      },
      required: ["kind", "trigger", "steps", "promotable"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["feedback"] },
        targetArtifactId: { type: "string", minLength: 1 },
        signal: { type: "string", enum: ["positive", "negative", "correction"] },
        reason: { type: "string", minLength: 1 }
      },
      required: ["kind", "targetArtifactId", "signal", "reason"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["rejected-update"] },
        targetArtifactId: { type: "string", minLength: 1 },
        rejectedAt: { type: "string" },
        reason: { type: "string", minLength: 1 },
        retryable: { type: "boolean" }
      },
      required: ["kind", "targetArtifactId", "rejectedAt", "reason", "retryable"],
      additionalProperties: false
    }
  ]
};
var packageHash = { type: ["string", "null"], pattern: "^sha256-v2:[0-9a-f]{64}$" };
var packageHashString = { type: "string", pattern: "^sha256-v2:[0-9a-f]{64}$" };
var sha256Digest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
var capability = { type: "string", enum: ["filesystem-read", "filesystem-write", "network", "shell", "secrets"] };
var provenanceReference = {
  type: "object",
  properties: {
    artifactId: { type: "string", minLength: 1 },
    revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    contentHash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }
  },
  required: ["artifactId", "revision", "contentHash"],
  additionalProperties: false
};
var packageFile = {
  type: "object",
  properties: {
    relativePath: { type: "string", minLength: 1, maxLength: 500 },
    mode: { type: "integer", enum: [420, 493] },
    content: { type: "string", maxLength: 524288 }
  },
  required: ["relativePath", "mode", "content"],
  additionalProperties: false
};
var workflowProof = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["skillloom-workflow-proof-v1"] },
    decisionId: { type: "string", minLength: 1 },
    idempotencyKey: { type: "string", minLength: 1 },
    verdict: { type: "string", enum: ["passed", "failed"] },
    workflow: {
      type: "object",
      properties: {
        artifactId: { type: "string", minLength: 1 },
        revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
        contentHash: sha256Digest
      },
      required: ["artifactId", "revision", "contentHash"],
      additionalProperties: false
    },
    candidate: {
      type: "object",
      properties: {
        candidateId: { type: "string", minLength: 1 },
        packageHash: packageHashString
      },
      required: ["candidateId", "packageHash"],
      additionalProperties: false
    },
    verifier: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["replay", "held-out-evaluation"] },
        summary: { type: "string", minLength: 1 },
        evidence: { type: "string", minLength: 1 }
      },
      required: ["kind", "summary", "evidence"],
      additionalProperties: false
    },
    provenanceHashes: { type: "array", items: sha256Digest },
    decidedAt: { type: "string" }
  },
  required: ["schemaVersion", "decisionId", "idempotencyKey", "verdict", "workflow", "candidate", "verifier", "provenanceHashes", "decidedAt"],
  additionalProperties: false
};
var definitions = [
  {
    name: "brain_search",
    description: "Search authorized second-brain artifacts.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 500 }, type: artifactType, limit: { type: "integer", minimum: 1, maximum: 50 } },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "brain_retrieve",
    description: "Retrieve bounded hot context with explainable quick, standard, or deep ranking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        tier: { type: "string", enum: ["quick", "standard", "deep"] },
        limit: { type: "integer", minimum: 1, maximum: 40 },
        filters: {
          type: "object",
          properties: {
            types: { type: "array", items: artifactType, uniqueItems: true },
            layers: { type: "array", items: artifactLayer, uniqueItems: true },
            sensitivities: { type: "array", items: sensitivity, uniqueItems: true },
            statuses: { type: "array", items: { type: "string", enum: ["draft", "accepted", "disputed", "superseded"] }, uniqueItems: true },
            updatedAfter: { type: "string" },
            updatedBefore: { type: "string" },
            hasSource: { type: "boolean" }
          },
          additionalProperties: false
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "brain_health",
    description: "Lint read-only Brain store, audit log, and derived index consistency.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "brain_read",
    description: "Read one authorized second-brain artifact.",
    inputSchema: { type: "object", properties: { artifactId }, required: ["artifactId"], additionalProperties: false }
  },
  {
    name: "brain_capture",
    description: "Capture a new second-brain artifact with an idempotent request ID.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        type: artifactType,
        title: { type: "string", minLength: 1, maxLength: 500 },
        content: { type: "string", maxLength: 2e6 },
        frontmatter: jsonObject,
        provenance: jsonObject,
        layer: artifactLayer,
        source: sourceMetadata,
        details: artifactDetails,
        sensitivity
      },
      required: ["requestId", "type", "title", "content", "provenance", "sensitivity"],
      additionalProperties: false
    }
  },
  {
    name: "brain_update",
    description: "Update one second-brain artifact using optimistic revision control.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        artifactId,
        baseRevision: { type: "string", pattern: "^[1-9][0-9]*$" },
        type: artifactType,
        title: { type: "string", minLength: 1, maxLength: 500 },
        content: { type: "string", maxLength: 2e6 },
        frontmatter: jsonObject,
        provenance: jsonObject,
        layer: artifactLayer,
        details: artifactDetails,
        sensitivity
      },
      required: ["requestId", "artifactId", "baseRevision"],
      additionalProperties: false
    }
  },
  {
    name: "brain_link",
    description: "Create a typed relationship between two second-brain artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        sourceArtifactId: artifactId,
        targetArtifactId: artifactId,
        relationship: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" }
      },
      required: ["requestId", "sourceArtifactId", "targetArtifactId", "relationship"],
      additionalProperties: false
    }
  },
  {
    name: "skill_releases",
    description: "List verified releases from the approved stable skill channel.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false
    }
  },
  {
    name: "skill_read",
    description: "Read one verified stable release with validation evidence and safe UTF-8 files.",
    inputSchema: {
      type: "object",
      properties: { releaseId: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["releaseId"],
      additionalProperties: false
    }
  },
  {
    name: "skill_propose",
    description: "Propose a validated portable skill package to the Hub registry.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        name: { type: "string", minLength: 1, maxLength: 200 },
        baseReleaseHash: packageHash,
        capabilities: { type: "array", items: capability, uniqueItems: true, maxItems: 5 },
        provenance: { type: "array", items: provenanceReference, maxItems: 16 },
        files: { type: "array", items: packageFile, minItems: 1, maxItems: 256 },
        workflowProof
      },
      required: ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files"],
      additionalProperties: false
    }
  },
  {
    name: "skill_publish",
    description: "Publish a validated registry candidate to the stable skill channel.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        candidateId: { type: "string", minLength: 1, maxLength: 200 },
        version: { type: "string", pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$" },
        channel: { type: "string", enum: ["stable"] },
        workflowProof
      },
      required: ["requestId", "candidateId", "version", "channel"],
      additionalProperties: false
    }
  }
];
function listBrainMcpTools() {
  return definitions;
}

// src/hub/auth/errors.ts
var HubAuthorizationError = class extends Error {
  constructor(message2) {
    super(message2);
    this.name = "HubAuthorizationError";
  }
};

// src/hub/auth/role-permissions.ts
var roleOrder = ["reader", "contributor", "promoter", "admin"];
var permissionsByRole = {
  reader: ["brain:read", "skill:read"],
  contributor: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose"],
  promoter: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish"],
  admin: ["brain:read", "brain:capture", "brain:update", "brain:link", "skill:read", "skill:propose", "skill:publish", "hub:admin"]
};
var hubRoles = roleOrder;
var hubPermissions = permissionsByRole.admin;
function normalizeHubRoles(roles) {
  const unique2 = new Set(roles);
  return roleOrder.filter((role) => unique2.has(role));
}
function permissionsForHubRoles(roles) {
  const grantedRoles = new Set(roles);
  return hubPermissions.filter((permission) => roleOrder.some((role) => grantedRoles.has(role) && permissionsByRole[role].includes(permission)));
}

// src/hub/auth/schema.ts
var capabilityNamePattern = /^[a-z0-9.-]+\/cap\/[a-z0-9._-]+$/;
function parseHubAuthorizationPolicy(value) {
  const record = requiredRecord(value, "Hub authorization policy");
  requireExactKeys(record, ["actorRoles", "capabilityNamespaces"], "Hub authorization policy");
  const actorRoles = parseActorRoles(record.actorRoles);
  const capabilityNamespaces = parseCapabilityNamespaces(record.capabilityNamespaces);
  return { actorRoles, capabilityNamespaces };
}
function parseHubAuthorizationIdentity(value) {
  const record = requiredRecord(value, "Trusted identity");
  const actorId = requiredString(record.actorId, "Trusted identity actorId");
  const kind = record.kind;
  if (kind !== "user" && kind !== "node") throw new HubAuthorizationError("Trusted identity kind is invalid");
  if (!Array.isArray(record.appCapabilities)) throw new HubAuthorizationError("Trusted identity capabilities are invalid");
  const appCapabilities = record.appCapabilities.map(parseCapability);
  const displayName = optionalString2(record.displayName, "Trusted identity displayName");
  const nodeId = optionalString2(record.nodeId, "Trusted identity nodeId");
  const nodeName = optionalString2(record.nodeName, "Trusted identity nodeName");
  return {
    actorId,
    kind,
    appCapabilities,
    ...displayName === void 0 ? {} : { displayName },
    ...nodeId === void 0 ? {} : { nodeId },
    ...nodeName === void 0 ? {} : { nodeName }
  };
}
function parseHubPrincipal(value) {
  const record = requiredRecord(value, "Hub principal");
  requireExactKeys(record, ["actorId", "kind", "stableActor", "roles", "capabilityNamespaces"], "Hub principal");
  const actorId = requiredString(record.actorId, "Hub principal actorId");
  const kind = record.kind;
  if (kind !== "user" && kind !== "node") throw new HubAuthorizationError("Hub principal kind is invalid");
  if (typeof record.stableActor !== "boolean") throw new HubAuthorizationError("Hub principal stableActor is invalid");
  if (!Array.isArray(record.roles) || !record.roles.every(isHubRole)) throw new HubAuthorizationError("Hub principal roles are invalid");
  if (!Array.isArray(record.capabilityNamespaces) || !record.capabilityNamespaces.every(isCapabilityName)) {
    throw new HubAuthorizationError("Hub principal capability namespaces are invalid");
  }
  return {
    actorId,
    kind,
    stableActor: record.stableActor,
    roles: [...record.roles],
    capabilityNamespaces: [...record.capabilityNamespaces]
  };
}
function parseHubAuthorizationContextData(value) {
  const record = requiredRecord(value, "Hub authorization context");
  requireExactKeys(record, ["principal", "permissions"], "Hub authorization context");
  if (!Array.isArray(record.permissions) || !record.permissions.every(isHubPermission)) {
    throw new HubAuthorizationError("Hub authorization context permissions are invalid");
  }
  return {
    principal: parseHubPrincipal(record.principal),
    permissions: [...new Set(record.permissions)]
  };
}
function parseHubPermission(value) {
  if (!isHubPermission(value)) throw new HubAuthorizationError("Hub permission is invalid");
  return value;
}
function isHubRole(value) {
  return typeof value === "string" && hubRoles.some((role) => role === value);
}
function isStableHubActor(identity) {
  if (identity.kind === "user") return /^user:[^\s:][^\s]*$/.test(identity.actorId);
  return identity.nodeId !== void 0 && identity.nodeId.length > 0 && identity.actorId === `node:${identity.nodeId}`;
}
function parseActorRoles(value) {
  const record = requiredRecord(value, "Hub authorization actor roles");
  return Object.fromEntries(Object.entries(record).map(([actorId, roles]) => {
    if (!/^user:[^\s:][^\s]*$|^node:[^\s:][^\s]*$/.test(actorId)) {
      throw new HubAuthorizationError("Hub authorization actor role key is invalid");
    }
    if (!Array.isArray(roles) || roles.length === 0 || !roles.every(isHubRole)) {
      throw new HubAuthorizationError("Hub authorization actor roles are invalid");
    }
    return [actorId, [...roles]];
  }));
}
function parseCapabilityNamespaces(value) {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCapabilityName)) {
    throw new HubAuthorizationError("Hub authorization capability namespaces are invalid");
  }
  return [...new Set(value)].sort();
}
function parseCapability(value) {
  const record = requiredRecord(value, "Trusted identity capability");
  requireExactKeys(record, ["name", "grants"], "Trusted identity capability");
  const name = requiredString(record.name, "Trusted identity capability name");
  if (!isCapabilityName(name)) throw new HubAuthorizationError("Trusted identity capability name is invalid");
  if (!Array.isArray(record.grants)) throw new HubAuthorizationError("Trusted identity capability grants are invalid");
  const grants = record.grants.map((grant) => parseJsonRecord(grant, "Trusted identity capability grant"));
  return { name, grants };
}
function requiredRecord(value, field) {
  if (!isRecord4(value)) throw new HubAuthorizationError(`${field} must be an object`);
  return value;
}
function requireExactKeys(value, keys, field) {
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value))) {
    throw new HubAuthorizationError(`${field} fields are invalid`);
  }
}
function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) throw new HubAuthorizationError(`${field} must be a non-empty string`);
  return value;
}
function optionalString2(value, field) {
  if (value === void 0) return void 0;
  return requiredString(value, field);
}
function isCapabilityName(value) {
  return typeof value === "string" && capabilityNamePattern.test(value);
}
function isHubPermission(value) {
  return typeof value === "string" && hubPermissions.some((permission) => permission === value);
}
function parseJsonRecord(value, field) {
  const record = requiredRecord(value, field);
  return parseJsonRecordAtDepth(record, field, 0);
}
function parseJsonRecordAtDepth(value, field, depth) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseJsonValue(item, field, depth)]));
}
function parseJsonValue(value, field, depth) {
  if (depth > 8) throw new HubAuthorizationError(`${field} nesting is invalid`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => parseJsonValue(item, field, depth + 1));
  if (isRecord4(value)) return parseJsonRecordAtDepth(value, field, depth + 1);
  throw new HubAuthorizationError(`${field} JSON value is invalid`);
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/auth/service.ts
function createHubAuthorizationService(policyInput) {
  const policy = parseHubAuthorizationPolicy(policyInput);
  return {
    authorize(identityInput) {
      const identity = parseHubAuthorizationIdentity(identityInput);
      const principal = createPrincipal(identity, policy);
      const permissions = permissionsForPrincipal(principal);
      return createContext(principal, permissions);
    }
  };
}
function createPrincipal(identity, policy) {
  const stableActor = isStableHubActor(identity);
  const roles = normalizeHubRoles([
    ...stableActor ? policy.actorRoles[identity.actorId] ?? [] : [],
    ...capabilityRoles(identity.appCapabilities, policy.capabilityNamespaces)
  ]);
  return parseHubPrincipal({
    actorId: identity.actorId,
    kind: identity.kind,
    stableActor,
    roles,
    capabilityNamespaces: identity.appCapabilities.map((capability2) => capability2.name).filter((name) => policy.capabilityNamespaces.includes(name))
  });
}
function capabilityRoles(capabilities2, allowedNamespaces) {
  return capabilities2.filter((capability2) => allowedNamespaces.includes(capability2.name)).flatMap((capability2) => capability2.grants.flatMap(parseGrantRoles));
}
function parseGrantRoles(grant) {
  const keys = Object.keys(grant);
  if (keys.length !== 1 || keys[0] !== "roles" || !Array.isArray(grant.roles) || grant.roles.length === 0 || !grant.roles.every(isHubRole)) {
    return [];
  }
  return [...grant.roles];
}
function permissionsForPrincipal(principal) {
  const permissions = permissionsForHubRoles(principal.roles);
  return principal.stableActor ? permissions : permissions.filter((permission) => permission === "brain:read" || permission === "skill:read");
}
function createContext(principal, permissions) {
  const data = parseHubAuthorizationContextData({ principal, permissions });
  const allows = (permission) => data.permissions.includes(parseHubPermission(permission));
  const context = {
    ...data,
    allows,
    require(permission) {
      if (!allows(permission)) throw new HubAuthorizationError(`Actor ${principal.actorId} lacks ${permission}`);
      return context;
    }
  };
  return context;
}

// src/hub/brain/errors.ts
var BrainError = class extends Error {
  constructor(message2, code) {
    super(message2);
    this.code = code;
  }
  code;
};
var BrainValidationError = class extends BrainError {
  constructor(message2) {
    super(message2, "BRAIN_VALIDATION_ERROR");
  }
};
var BrainNotFoundError = class extends BrainError {
  constructor(artifactId2) {
    super(`Brain artifact ${artifactId2} was not found`, "BRAIN_ARTIFACT_NOT_FOUND");
    this.artifactId = artifactId2;
  }
  artifactId;
};
var BrainRevisionConflictError = class extends BrainError {
  constructor(baseRevision, currentRevision, baseContentHash, currentContentHash) {
    super(`Brain revision conflict: base ${baseRevision}, current ${currentRevision}`, "BRAIN_REVISION_CONFLICT");
    this.baseRevision = baseRevision;
    this.currentRevision = currentRevision;
    this.baseContentHash = baseContentHash;
    this.currentContentHash = currentContentHash;
  }
  baseRevision;
  currentRevision;
  baseContentHash;
  currentContentHash;
};
var BrainIdempotencyConflictError = class extends BrainError {
  constructor(actorId, requestId2) {
    super(`Request ${requestId2} was already used by ${actorId} with a different payload`, "BRAIN_IDEMPOTENCY_CONFLICT");
    this.actorId = actorId;
    this.requestId = requestId2;
  }
  actorId;
  requestId;
};
var BrainImmutableSourceError = class extends BrainError {
  constructor(artifactId2) {
    super(`Brain source artifact ${artifactId2} is immutable`, "BRAIN_IMMUTABLE_SOURCE");
    this.artifactId = artifactId2;
  }
  artifactId;
};
var BrainSourceSensitivityMismatchError = class extends BrainError {
  constructor(contentHash) {
    super(`Brain source ${contentHash} already exists with a different sensitivity`, "BRAIN_SOURCE_SENSITIVITY_MISMATCH");
    this.contentHash = contentHash;
  }
  contentHash;
};
var BrainStorageCorruptionError = class extends BrainError {
  constructor(message2) {
    super(message2, "BRAIN_STORAGE_CORRUPTION");
  }
};

// src/hub/brain/hash.ts
import { createHash as createHash6 } from "node:crypto";
function hashBrainContent(content) {
  return `sha256:${createHash6("sha256").update(content).digest("hex")}`;
}
function hashBrainPayload(value) {
  return `sha256:${createHash6("sha256").update(canonicalJson(value)).digest("hex")}`;
}
function deterministicBrainId(namespace, actorId, requestId2) {
  const hex = createHash6("sha256").update(`${namespace}\0${actorId}\0${requestId2}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}
function normalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object") {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const candidate2 = Object.getOwnPropertyDescriptor(value, key)?.value;
      if (candidate2 !== void 0) {
        normalized[key] = normalize(candidate2);
      }
    }
    return normalized;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

// src/hub/brain/artifact-details.ts
var artifactLayers = new Set(brainArtifactLayers);
function parseBrainArtifactLayer(value) {
  if (value === "evidence" || value === "human-knowledge" || value === "agent-knowledge" || value === "workflow" || value === "skill" || value === "derived") {
    return value;
  }
  throw new BrainStorageCorruptionError("Brain artifact layer is malformed");
}
function parseBrainSourceMetadata(value) {
  if (!isRecord5(value) || typeof value.sourceId !== "string" || typeof value.capturedAt !== "string" || typeof value.contentHash !== "string" || optionalStringMalformed(value.uri) || optionalStringMalformed(value.title) || optionalStringMalformed(value.mediaType) || optionalStringMalformed(value.fetchedAt) || optionalStringMalformed(value.retrievedBy)) {
    throw new BrainStorageCorruptionError("Brain source metadata is malformed");
  }
  const uri = optionalString3(value.uri);
  const title = optionalString3(value.title);
  const mediaType = optionalString3(value.mediaType);
  const fetchedAt = optionalString3(value.fetchedAt);
  const retrievedBy = optionalString3(value.retrievedBy);
  const capturedAt = canonicalIsoTimestamp(value.capturedAt, "capturedAt");
  const canonicalFetchedAt = fetchedAt === void 0 ? void 0 : canonicalIsoTimestamp(fetchedAt, "fetchedAt");
  return {
    sourceId: value.sourceId,
    capturedAt,
    contentHash: value.contentHash,
    ...uri === void 0 ? {} : { uri },
    ...title === void 0 ? {} : { title },
    ...mediaType === void 0 ? {} : { mediaType },
    ...canonicalFetchedAt === void 0 ? {} : { fetchedAt: canonicalFetchedAt },
    ...retrievedBy === void 0 ? {} : { retrievedBy }
  };
}
function canonicalIsoTimestamp(value, field) {
  const timestamp3 = Date.parse(value);
  if (Number.isNaN(timestamp3)) {
    throw new BrainStorageCorruptionError(`Brain source metadata ${field} is malformed`);
  }
  return new Date(timestamp3).toISOString();
}
function parseBrainArtifactDetails(value) {
  if (!isRecord5(value)) {
    throw new BrainStorageCorruptionError("Brain artifact details are malformed");
  }
  if (Object.keys(value).length === 0 || value.kind === "none") return { kind: "none" };
  if (value.kind === "knowledge" || isRecord5(value.knowledge)) return parseKnowledgeDetails(value.kind === "knowledge" ? value : value.knowledge);
  if (value.kind === "episode" || isRecord5(value.episode)) return parseEpisodeDetails(value.kind === "episode" ? value : value.episode);
  if (value.kind === "workflow" || isRecord5(value.workflow)) return parseWorkflowDetails(value.kind === "workflow" ? value : value.workflow);
  if (value.kind === "feedback" || isRecord5(value.feedback)) return parseFeedbackDetails(value.kind === "feedback" ? value : value.feedback);
  if (value.kind === "rejected-update" || isRecord5(value.rejectedUpdate)) {
    return parseRejectedUpdateDetails(value.kind === "rejected-update" ? value : value.rejectedUpdate);
  }
  throw new BrainStorageCorruptionError("Brain artifact details kind is malformed");
}
function validateBrainArtifactConsistency(type, layer, details) {
  if (!artifactLayers.has(layer) || layer !== defaultBrainLayer(type)) {
    throw new BrainStorageCorruptionError("Brain artifact layer does not match artifact type");
  }
  if (!detailKindAllowed(type, details.kind)) {
    throw new BrainStorageCorruptionError("Brain artifact details do not match artifact type");
  }
}
function parseKnowledgeDetails(value) {
  if (!isRecord5(value) || !isKnowledgeStatus(value.status) || value.confidence !== void 0 && (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) || value.entities !== void 0 && !isStringArray2(value.entities) || value.concepts !== void 0 && !isStringArray2(value.concepts)) {
    throw new BrainStorageCorruptionError("Brain knowledge details are malformed");
  }
  return {
    kind: "knowledge",
    status: value.status,
    ...value.confidence === void 0 ? {} : { confidence: value.confidence },
    ...value.entities === void 0 ? {} : { entities: value.entities },
    ...value.concepts === void 0 ? {} : { concepts: value.concepts }
  };
}
function parseEpisodeDetails(value) {
  if (!isRecord5(value) || typeof value.taskId !== "string" || typeof value.hostId !== "string" || typeof value.startedAt !== "string" || optionalStringMalformed(value.endedAt) || !isEpisodeOutcome(value.outcome)) {
    throw new BrainStorageCorruptionError("Brain episode details are malformed");
  }
  const endedAt = optionalString3(value.endedAt);
  return {
    kind: "episode",
    taskId: value.taskId,
    hostId: value.hostId,
    startedAt: value.startedAt,
    ...endedAt === void 0 ? {} : { endedAt },
    outcome: value.outcome
  };
}
function parseWorkflowDetails(value) {
  if (!isRecord5(value) || typeof value.trigger !== "string" || !isStringArray2(value.steps) || optionalStringMalformed(value.verifier) || typeof value.promotable !== "boolean") {
    throw new BrainStorageCorruptionError("Brain workflow details are malformed");
  }
  const verifier = optionalString3(value.verifier);
  return {
    kind: "workflow",
    trigger: value.trigger,
    steps: value.steps,
    ...verifier === void 0 ? {} : { verifier },
    promotable: value.promotable
  };
}
function parseFeedbackDetails(value) {
  if (!isRecord5(value) || typeof value.targetArtifactId !== "string" || !isFeedbackSignal(value.signal) || typeof value.reason !== "string") {
    throw new BrainStorageCorruptionError("Brain feedback details are malformed");
  }
  return {
    kind: "feedback",
    targetArtifactId: value.targetArtifactId,
    signal: value.signal,
    reason: value.reason
  };
}
function parseRejectedUpdateDetails(value) {
  if (!isRecord5(value) || typeof value.targetArtifactId !== "string" || typeof value.rejectedAt !== "string" || typeof value.reason !== "string" || typeof value.retryable !== "boolean") {
    throw new BrainStorageCorruptionError("Brain rejected update details are malformed");
  }
  return {
    kind: "rejected-update",
    targetArtifactId: value.targetArtifactId,
    rejectedAt: value.rejectedAt,
    reason: value.reason,
    retryable: value.retryable
  };
}
function detailKindAllowed(type, kind) {
  if (type === "bounded-episode") return kind === "episode";
  if (type === "workflow") return kind === "workflow";
  if (type === "feedback") return kind === "feedback";
  if (type === "rejected-update") return kind === "rejected-update";
  if (type === "fact" || type === "claim" || type === "entity" || type === "concept" || type === "decision" || type === "project") {
    return kind === "none" || kind === "knowledge";
  }
  return kind === "none";
}
function isKnowledgeStatus(value) {
  return value === "draft" || value === "accepted" || value === "disputed" || value === "superseded";
}
function isEpisodeOutcome(value) {
  return value === "success" || value === "failure" || value === "partial" || value === "cancelled";
}
function isFeedbackSignal(value) {
  return value === "positive" || value === "negative" || value === "correction";
}
function isStringArray2(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function optionalStringMalformed(value) {
  return value !== void 0 && typeof value !== "string";
}
function optionalString3(value) {
  return typeof value === "string" ? value : void 0;
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/brain/validation.ts
var artifactTypes = new Set(brainArtifactTypes);
var artifactLayers2 = new Set(brainArtifactLayers);
var relationshipTypes = new Set(brainRelationshipTypes);
var sensitivities = /* @__PURE__ */ new Set(["private", "tailnet", "restricted"]);
var decimalPattern = /^(0|[1-9]\d*)$/;
var identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
var relationshipPattern = /^[a-z][a-z0-9-]{0,63}$/;
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var noneDetails = { kind: "none" };
function validateActor(actor) {
  validateIdentifier(actor.actorId, "actorId");
}
function validateRequestId(requestId2) {
  validateIdentifier(requestId2, "requestId");
}
function validateArtifactId(artifactId2) {
  if (!uuidPattern.test(artifactId2)) {
    throw new BrainValidationError("artifactId must be a canonical lowercase UUID");
  }
}
function validateRevision(revision, field = "revision") {
  if (!decimalPattern.test(revision) || BigInt(revision) < 1n) {
    throw new BrainValidationError(`${field} must be a positive decimal string`);
  }
}
function validateTitle(title) {
  if (title.trim().length === 0 || title.length > 500) {
    throw new BrainValidationError("title must contain 1 to 500 characters");
  }
}
function validateContent(content) {
  if (content.length > 2e6) {
    throw new BrainValidationError("content exceeds the 2000000 character limit");
  }
}
function validateRelationship(relationship) {
  if (!relationshipTypes.has(relationship) && !relationshipPattern.test(relationship)) {
    throw new BrainValidationError("relationship must be a lowercase typed relationship");
  }
}
function validateSearchQuery(query2) {
  if (query2.trim().length === 0 || query2.length > 500) {
    throw new BrainValidationError("search query must contain 1 to 500 characters");
  }
}
function isBrainArtifactType(value) {
  return typeof value === "string" && artifactTypes.has(value);
}
function isBrainSensitivity(value) {
  return typeof value === "string" && sensitivities.has(value);
}
function isBrainArtifactLayer(value) {
  return typeof value === "string" && artifactLayers2.has(value);
}
function validateBrainJsonRecord(value, field) {
  if (!isJsonRecord(value)) {
    throw new BrainValidationError(`${field} must contain only JSON values`);
  }
}
function parseBrainArtifact(value) {
  if (!isRecord6(value) || typeof value.id !== "string" || !isBrainArtifactType(value.type) || typeof value.path !== "string" || typeof value.revision !== "string" || typeof value.contentHash !== "string" || typeof value.title !== "string" || typeof value.content !== "string" || !isJsonRecord(value.frontmatter) || !isJsonRecord(value.provenance) || !isBrainSensitivity(value.sensitivity) || typeof value.createdAt !== "string" || typeof value.createdBy !== "string" || typeof value.updatedAt !== "string" || typeof value.updatedBy !== "string") {
    throw new BrainStorageCorruptionError("Brain artifact metadata is malformed");
  }
  const type = value.type;
  const layer = value.layer === void 0 ? defaultBrainLayer(type) : parseBrainArtifactLayer(value.layer);
  const details = value.details === void 0 ? noneDetails : parseBrainArtifactDetails(value.details);
  validateBrainArtifactConsistency(type, layer, details);
  return {
    id: value.id,
    type,
    layer,
    path: value.path,
    revision: value.revision,
    contentHash: value.contentHash,
    title: value.title,
    content: value.content,
    frontmatter: value.frontmatter,
    provenance: value.provenance,
    ...value.source === void 0 ? {} : { source: parseBrainSourceMetadata(value.source) },
    details,
    sensitivity: value.sensitivity,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy
  };
}
function parseBrainArtifactMetadata(value) {
  return withoutContent(parseBrainArtifact({ ...recordOrThrow(value), content: "" }));
}
function parseBrainMutationResult(value) {
  if (!isRecord6(value) || typeof value.kind !== "string" || typeof value.eventSequence !== "string") {
    throw new BrainStorageCorruptionError("Brain mutation result is malformed");
  }
  if (value.kind === "artifact") {
    return { kind: "artifact", artifact: parseBrainArtifactMetadata(value.artifact), eventSequence: value.eventSequence };
  }
  if (value.kind === "link") {
    return { kind: "link", link: parseBrainLink(value.link), eventSequence: value.eventSequence };
  }
  throw new BrainStorageCorruptionError("Brain mutation result kind is malformed");
}
function parseBrainAuditEvent(value) {
  if (!isRecord6(value) || typeof value.sequence !== "string" || !decimalPattern.test(value.sequence) || typeof value.eventId !== "string" || !isAuditKind(value.kind) || !isRecord6(value.actor) || typeof value.actor.actorId !== "string" || !isRecord6(value.resource) || !isResourceKind(value.resource.kind) || typeof value.resource.id !== "string" || typeof value.requestId !== "string" || typeof value.payloadHash !== "string" || typeof value.createdAt !== "string") {
    throw new BrainStorageCorruptionError("Brain audit event is malformed");
  }
  return {
    sequence: value.sequence,
    eventId: value.eventId,
    kind: value.kind,
    actor: { actorId: value.actor.actorId },
    resource: {
      kind: value.resource.kind,
      id: value.resource.id,
      ...typeof value.resource.revision === "string" ? { revision: value.resource.revision } : {}
    },
    requestId: value.requestId,
    payloadHash: value.payloadHash,
    result: parseBrainMutationResult(value.result),
    createdAt: value.createdAt
  };
}
function parseBrainPendingOperation(value) {
  if (!isRecord6(value) || value.version !== 1 || typeof value.operationId !== "string" || !isAction(value.action) || !isRecord6(value.actor) || typeof value.actor.actorId !== "string" || typeof value.requestId !== "string" || typeof value.payloadHash !== "string" || !isRecord6(value.event) || typeof value.createdAt !== "string") {
    throw new BrainStorageCorruptionError("Pending brain operation is malformed");
  }
  const event = parseAuditDraft(value.event);
  if (value.action === "link") {
    return {
      version: 1,
      operationId: value.operationId,
      action: "link",
      actor: { actorId: value.actor.actorId },
      requestId: value.requestId,
      payloadHash: value.payloadHash,
      link: parseBrainLink(value.link),
      event,
      createdAt: value.createdAt
    };
  }
  return {
    version: 1,
    operationId: value.operationId,
    action: value.action,
    actor: { actorId: value.actor.actorId },
    requestId: value.requestId,
    payloadHash: value.payloadHash,
    artifact: parseBrainArtifact(value.artifact),
    ...parseArtifactBase(value.base) ? { base: parseArtifactBase(value.base) } : {},
    event,
    createdAt: value.createdAt
  };
}
function parseArtifactBase(value) {
  if (value === void 0) {
    return void 0;
  }
  if (!isRecord6(value) || typeof value.revision !== "string" || typeof value.contentHash !== "string") {
    throw new BrainStorageCorruptionError("Pending brain base revision is malformed");
  }
  return { revision: value.revision, contentHash: value.contentHash };
}
function withoutContent(artifact) {
  return {
    id: artifact.id,
    type: artifact.type,
    layer: artifact.layer,
    path: artifact.path,
    revision: artifact.revision,
    contentHash: artifact.contentHash,
    title: artifact.title,
    frontmatter: artifact.frontmatter,
    provenance: artifact.provenance,
    ...artifact.source === void 0 ? {} : { source: artifact.source },
    details: artifact.details,
    sensitivity: artifact.sensitivity,
    createdAt: artifact.createdAt,
    createdBy: artifact.createdBy,
    updatedAt: artifact.updatedAt,
    updatedBy: artifact.updatedBy
  };
}
function parseBrainLink(value) {
  if (!isRecord6(value) || typeof value.id !== "string" || typeof value.sourceArtifactId !== "string" || typeof value.targetArtifactId !== "string" || typeof value.relationship !== "string" || typeof value.createdAt !== "string" || typeof value.createdBy !== "string") {
    throw new BrainStorageCorruptionError("Brain link is malformed");
  }
  validateRelationship(value.relationship);
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}
function parseAuditDraft(value) {
  const parsed = parseBrainAuditEvent({ ...value, sequence: "1", result: draftResult(value) });
  return {
    eventId: parsed.eventId,
    kind: parsed.kind,
    actor: parsed.actor,
    resource: parsed.resource,
    requestId: parsed.requestId,
    payloadHash: parsed.payloadHash,
    createdAt: parsed.createdAt
  };
}
function draftResult(value) {
  const resource = isRecord6(value.resource) ? value.resource : {};
  if (resource.kind === "brain-link") {
    return {
      kind: "link",
      link: {
        id: "00000000-0000-0000-0000-000000000000",
        sourceArtifactId: "00000000-0000-0000-0000-000000000000",
        targetArtifactId: "00000000-0000-0000-0000-000000000000",
        relationship: "related-to",
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        createdBy: "system"
      },
      eventSequence: "1"
    };
  }
  return {
    kind: "artifact",
    artifact: {
      id: "00000000-0000-0000-0000-000000000000",
      type: "note",
      layer: "human-knowledge",
      path: "vault/inbox/00000000-0000-0000-0000-000000000000.md",
      revision: "1",
      contentHash: "sha256:0",
      title: "pending",
      frontmatter: {},
      provenance: {},
      details: { kind: "none" },
      sensitivity: "private",
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      createdBy: "system",
      updatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      updatedBy: "system"
    },
    eventSequence: "1"
  };
}
function validateIdentifier(value, field) {
  if (!identifierPattern.test(value)) {
    throw new BrainValidationError(`${field} contains unsupported characters or length`);
  }
}
function isAction(value) {
  return value === "capture" || value === "update" || value === "link";
}
function isAuditKind(value) {
  return value === "brain.captured" || value === "brain.updated" || value === "brain.linked";
}
function isResourceKind(value) {
  return value === "brain-artifact" || value === "brain-link";
}
function isJsonRecord(value) {
  if (!isRecord6(value)) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}
function isJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonRecord(value);
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordOrThrow(value) {
  if (!isRecord6(value)) {
    throw new BrainStorageCorruptionError("Expected a JSON object");
  }
  return value;
}

// src/hub/brain/layout.ts
import { join as join24 } from "node:path";
function brainLayout(root4) {
  const vault = join24(root4, "vault");
  const operations = join24(root4, "operations");
  const index = join24(root4, "index");
  const projections = join24(root4, "projections");
  const obsidianVault = join24(projections, "obsidian-vault");
  const obsidianProjection = join24(obsidianVault, "Library");
  const obsidianProjectionStaging = join24(projections, "obsidian-staging");
  const obsidianAuthoring = join24(root4, "authoring");
  const obsidianAuthoringState = join24(operations, "obsidian-authoring");
  return {
    root: root4,
    vault,
    inbox: join24(vault, "inbox"),
    curated: join24(vault, "curated"),
    operations,
    staging: join24(operations, "staging"),
    pending: join24(operations, "pending"),
    humanInbox: join24(operations, "human-inbox"),
    humanInboxCheckpoints: join24(operations, "human-inbox", "checkpoints.json"),
    obsidianAuthoring,
    obsidianAuthoringInbox: join24(obsidianAuthoring, "Inbox"),
    obsidianAuthoringCurated: join24(obsidianAuthoring, "Curated"),
    obsidianAuthoringEvidence: join24(obsidianAuthoring, "Evidence"),
    obsidianAuthoringConflicts: join24(obsidianAuthoring, "Conflicts"),
    obsidianAuthoringCheckpoints: join24(obsidianAuthoringState, "checkpoints.json"),
    projections,
    obsidianVault,
    obsidianProjection,
    obsidianProjectionNext: join24(obsidianProjectionStaging, "next"),
    obsidianProjectionPrevious: join24(obsidianProjectionStaging, "previous"),
    obsidianBases: join24(root4, "obsidian-ui", "Bases"),
    index,
    audit: join24(index, "audit.jsonl"),
    sqlite: join24(index, "brain.sqlite")
  };
}

// src/hub/brain/health.ts
async function lintBrainHealth(source, audit, index, checkedAt) {
  const artifacts = await source.list();
  const events = await audit.readAll();
  const snapshot = await index.healthSnapshot();
  const canonicalArtifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const indexedArtifactIds = new Set(snapshot.artifactIds);
  const canonicalLinks = linkIds(events);
  const indexedLinks = new Set(snapshot.linkIds);
  const indexedLinkRecords = await collectIndexedLinks(index, /* @__PURE__ */ new Set([...canonicalArtifactIds, ...indexedArtifactIds]));
  const issues = [];
  for (const artifactId2 of sorted(canonicalArtifactIds)) {
    if (!indexedArtifactIds.has(artifactId2)) issues.push({ code: "canonical-artifact-missing-from-index", severity: "error", detail: "Canonical artifact is absent from the derived index", artifactId: artifactId2 });
  }
  for (const artifactId2 of sorted(indexedArtifactIds)) {
    if (!canonicalArtifactIds.has(artifactId2)) issues.push({ code: "stale-index-artifact", severity: "error", detail: "Derived index contains an artifact absent from the canonical store", artifactId: artifactId2 });
  }
  for (const event of events) {
    if (!snapshot.eventSequences.includes(event.sequence)) issues.push({ code: "audit-event-missing-from-index", severity: "error", detail: "Audit event is absent from the derived index", eventSequence: event.sequence });
    if (!snapshot.idempotencyKeys.includes(`${event.actor.actorId}\0${event.requestId}`)) issues.push({ code: "idempotency-missing-from-index", severity: "error", detail: "Audit event lacks a derived idempotency record", eventSequence: event.sequence });
    if (event.result.kind === "link") pushOrphanLinkIssues(issues, canonicalArtifactIds, event.result.link, "orphan-audit-link-endpoint");
  }
  for (const eventSequence of snapshot.eventSequences) {
    if (!events.some((event) => event.sequence === eventSequence)) issues.push({ code: "stale-index-audit-event", severity: "error", detail: "Derived index contains an audit event absent from the audit log", eventSequence });
  }
  for (const linkId of [...canonicalLinks.keys()].sort()) {
    if (!indexedLinks.has(linkId)) issues.push({ code: "audit-link-missing-from-index", severity: "error", detail: "Audit link result is absent from the derived index", linkId });
  }
  for (const linkId of sorted(indexedLinks)) {
    if (!canonicalLinks.has(linkId)) issues.push({ code: "stale-index-link", severity: "warning", detail: "Derived index contains a link absent from the audit log", linkId });
  }
  for (const link of indexedLinkRecords) {
    pushOrphanLinkIssues(issues, canonicalArtifactIds, link, "orphan-index-link-endpoint");
  }
  return {
    status: issues.length === 0 ? "ok" : "degraded",
    checkedAt,
    canonicalArtifacts: canonicalArtifactIds.size,
    indexedArtifacts: indexedArtifactIds.size,
    auditEvents: events.length,
    indexedAuditEvents: snapshot.eventSequences.length,
    indexedLinks: snapshot.linkIds.length,
    unresolvedGaps: artifacts.filter((artifact) => artifact.type === "health-report" && artifact.frontmatter.gap === true).length,
    contradictions: [...canonicalLinks.values()].filter((link) => link.relationship === "contradicts").length,
    recoveredIndex: false,
    issues,
    recommendations: issues.length === 0 ? [] : ["rebuild-derived-index-from-canonical-store-and-audit-log"]
  };
}
function linkIds(events) {
  return new Map(events.flatMap((event) => event.result.kind === "link" ? [[event.result.link.id, event.result.link]] : []));
}
async function collectIndexedLinks(index, artifactIds) {
  const links = /* @__PURE__ */ new Map();
  for (const artifactId2 of sorted(artifactIds)) {
    for (const link of await index.links(artifactId2)) {
      links.set(link.id, link);
    }
  }
  return [...links.values()].sort((left, right) => left.id.localeCompare(right.id));
}
function pushOrphanLinkIssues(issues, artifactIds, link, code) {
  if (!artifactIds.has(link.sourceArtifactId) || !artifactIds.has(link.targetArtifactId)) {
    issues.push({ code, severity: "error", detail: "Brain link points at a missing canonical artifact", linkId: link.id });
  }
}
function sorted(values) {
  return [...values].sort();
}

// src/hub/brain/retrieval-scoring.ts
function scoreBrainArtifact(artifact, query2, graphDistance) {
  const terms = queryTerms(query2);
  const title = artifact.title.toLowerCase();
  const content = artifact.content.toLowerCase();
  const metadata2 = JSON.stringify({
    type: artifact.type,
    layer: artifact.layer,
    provenance: artifact.provenance,
    source: artifact.source ?? null,
    details: artifact.details
  }).toLowerCase();
  const reasons = [];
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += addReason(reasons, "title", 12, `title matches ${term}`);
    if (content.includes(term)) score += addReason(reasons, "content", 4, `content matches ${term}`);
    if (metadata2.includes(term)) score += addReason(reasons, "metadata", 3, `metadata matches ${term}`);
  }
  if (title.includes(query2.trim().toLowerCase())) score += addReason(reasons, "title", 10, "title matches full query");
  if (graphDistance > 0) score += addReason(reasons, "graph", graphDistance === 1 ? 6 : 3, `linked at distance ${graphDistance}`);
  if (terms.length > 0 && score > 0) score += addReason(reasons, "freshness", freshnessWeight(artifact.updatedAt), "updated timestamp tie-breaker");
  return { artifact, score: Number(score.toFixed(3)), reasons };
}
function queryTerms(query2) {
  return [...new Set((query2.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((term) => term.length > 0))].sort();
}
function addReason(reasons, kind, weight, detail) {
  reasons.push({ kind, weight, detail });
  return weight;
}
function freshnessWeight(updatedAt) {
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(0.999, Math.max(0, parsed / 1e13));
}

// src/hub/brain/retrieval-service.ts
var tierConfig = {
  quick: { seedLimit: 25, graphDepth: 0, candidateLimit: 25, resultLimit: 10, hotLimit: 4, hotBytes: 1200 },
  standard: { seedLimit: 50, graphDepth: 1, candidateLimit: 80, resultLimit: 20, hotLimit: 6, hotBytes: 2400 },
  deep: { seedLimit: 90, graphDepth: 2, candidateLimit: 140, resultLimit: 40, hotLimit: 10, hotBytes: 4e3 }
};
var BrainRetrievalService = class {
  constructor(source, audit, index, clock) {
    this.source = source;
    this.audit = audit;
    this.index = index;
    this.clock = clock;
  }
  source;
  audit;
  index;
  clock;
  async retrieve(input) {
    const repaired = await this.repairDerivedIndexIfDegraded();
    const retry = await this.withDerivedIndexRetry(() => this.retrieveOnce(input));
    return { ...retry.value, recoveredIndex: repaired || retry.recovered || retry.value.recoveredIndex };
  }
  async health() {
    const repaired = await this.repairDerivedIndexIfDegraded();
    const retry = await this.withDerivedIndexRetry(() => lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString()));
    return { ...retry.value, recoveredIndex: repaired || retry.recovered || retry.value.recoveredIndex };
  }
  async retrieveOnce(input) {
    const tier = input.tier ?? "quick";
    const config = tierConfig[tier];
    const requestedLimit = input.limit ?? config.resultLimit;
    const limit = Math.min(config.resultLimit, Math.max(1, Number.isInteger(requestedLimit) ? requestedLimit : config.resultLimit));
    const artifacts = await this.source.list();
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const seeds = await this.index.search(input.query, void 0, config.seedLimit);
    const distances = await this.candidateDistances(seeds.map((seed) => seed.id), config, byId);
    const filters = input.filters ?? {};
    const scoredResults = [...distances.entries()].flatMap(([artifactId2, distance]) => {
      const artifact = byId.get(artifactId2);
      if (!artifact || !matchesFilters(artifact, filters)) return [];
      const scored = scoreBrainArtifact(artifact, input.query, distance);
      if (scored.score <= 0) return [];
      return [this.item(scored.artifact, scored.score, scored.reasons, distance)];
    }).sort(compareItems).slice(0, limit);
    const results = await decorateBrainRetrievalItems(scoredResults, byId, this.index);
    const health = tier === "deep" ? await lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString()) : void 0;
    return {
      tier,
      query: input.query,
      filters,
      results,
      hotContext: hotContext(results, byId, config),
      recoveredIndex: false,
      ...health === void 0 ? {} : { health }
    };
  }
  async candidateDistances(seedIds, config, byId) {
    const distances = /* @__PURE__ */ new Map();
    const queue = seedIds.filter((id) => byId.has(id)).map((id) => ({ id, distance: 0 }));
    for (const id of seedIds) {
      if (byId.has(id)) distances.set(id, 0);
    }
    for (let cursor = 0; cursor < queue.length && distances.size < config.candidateLimit; cursor += 1) {
      const current = queue[cursor];
      if (!current || current.distance >= config.graphDepth) continue;
      const links = await this.index.links(current.id);
      for (const link of links) {
        const nextId = link.sourceArtifactId === current.id ? link.targetArtifactId : link.sourceArtifactId;
        if (!byId.has(nextId) || distances.has(nextId)) continue;
        distances.set(nextId, current.distance + 1);
        queue.push({ id: nextId, distance: current.distance + 1 });
        if (distances.size >= config.candidateLimit) break;
      }
    }
    return distances;
  }
  item(artifact, score, reasons, graphDistance) {
    return {
      ...withoutContent(artifact),
      excerpt: excerpt(artifact.content),
      score,
      graphDistance,
      reasons,
      decorations: { contradictions: [], gaps: [] }
    };
  }
  async withDerivedIndexRetry(fn) {
    try {
      return { value: await fn(), recovered: false };
    } catch (error) {
      await this.rebuildDerivedIndex();
      try {
        return { value: await fn(), recovered: true };
      } catch {
        throw error;
      }
    }
  }
  async repairDerivedIndexIfDegraded() {
    try {
      const report = await lintBrainHealth(this.source, this.audit, this.index, this.clock().toISOString());
      if (report.status === "ok") return false;
    } catch {
      await this.rebuildDerivedIndex();
      return true;
    }
    await this.rebuildDerivedIndex();
    return true;
  }
  async rebuildDerivedIndex() {
    await this.index.rebuild(await this.source.list(), await this.audit.readAll());
  }
};
function matchesFilters(artifact, filters) {
  return (filters.types === void 0 || filters.types.includes(artifact.type)) && (filters.layers === void 0 || filters.layers.includes(artifact.layer)) && (filters.sensitivities === void 0 || filters.sensitivities.includes(artifact.sensitivity)) && (filters.statuses === void 0 || artifact.details.kind === "knowledge" && filters.statuses.includes(artifact.details.status)) && (filters.updatedAfter === void 0 || artifact.updatedAt >= filters.updatedAfter) && (filters.updatedBefore === void 0 || artifact.updatedAt <= filters.updatedBefore) && (filters.hasSource === void 0 || artifact.source !== void 0 === filters.hasSource);
}
function compareItems(left, right) {
  return right.score - left.score || left.graphDistance - right.graphDistance || right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}
function hotContext(results, byId, config) {
  const items = [];
  let remaining = config.hotBytes;
  for (const result of results.slice(0, config.hotLimit)) {
    const artifact = byId.get(result.id);
    if (!artifact || remaining <= 0) continue;
    const content = clip(artifact.content, Math.min(480, remaining));
    remaining -= content.length;
    items.push({ artifactId: result.id, type: result.type, title: result.title, score: result.score, excerpt: result.excerpt, content });
  }
  return items;
}
async function decorateBrainRetrievalItems(results, byId, index) {
  const decorated = [];
  for (const result of results) {
    const related = await index.links(result.id);
    decorated.push({
      ...result,
      decorations: {
        contradictions: relatedDecorations(result.id, related, byId, "contradicts"),
        gaps: [
          ...relatedDecorations(result.id, related, byId, "fills-gap"),
          ...relatedDecorations(result.id, related, byId, "identifies-gap")
        ].sort((left, right) => left.artifact.id.localeCompare(right.artifact.id))
      }
    });
  }
  return decorated;
}
function relatedDecorations(artifactId2, links, byId, relationship) {
  return links.filter((link) => link.relationship === relationship).flatMap((link) => {
    const relatedId = link.sourceArtifactId === artifactId2 ? link.targetArtifactId : link.sourceArtifactId;
    const artifact = byId.get(relatedId);
    return artifact === void 0 ? [] : [{ artifact: withoutContent(artifact), relationship: relationship === "identifies-gap" ? "fills-gap" : relationship, link }];
  }).sort((left, right) => left.artifact.id.localeCompare(right.artifact.id));
}
function excerpt(content) {
  return clip(content.replace(/\s+/g, " ").trim(), 220);
}
function clip(value, limit) {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}

// src/hub/brain/audit-log.ts
import { mkdir as mkdir12, open as open4, readFile as readFile11 } from "node:fs/promises";
import { dirname as dirname12 } from "node:path";
var JsonlBrainAuditLog = class {
  path;
  queue = Promise.resolve();
  constructor(root4) {
    this.path = brainLayout(root4).audit;
  }
  async initialize() {
    await mkdir12(dirname12(this.path), { recursive: true });
  }
  async append(event, result) {
    return await this.enqueue(async () => {
      const events = await this.readAll();
      const existing = events.find((candidate2) => candidate2.eventId === event.eventId);
      if (existing) {
        if (existing.payloadHash !== event.payloadHash || existing.actor.actorId !== event.actor.actorId || existing.requestId !== event.requestId) {
          throw new BrainStorageCorruptionError(`Audit event ${event.eventId} conflicts with an existing event`);
        }
        return existing;
      }
      const sequence4 = (events.length === 0 ? 1n : BigInt(events.at(-1)?.sequence ?? "0") + 1n).toString();
      const record = {
        ...event,
        sequence: sequence4,
        result: { ...result, eventSequence: sequence4 }
      };
      const handle = await open4(this.path, "a", 384);
      try {
        await handle.appendFile(`${JSON.stringify(record)}
`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(dirname12(this.path));
      return record;
    });
  }
  async readAll() {
    let text4;
    try {
      text4 = await readFile11(this.path, "utf8");
    } catch (error) {
      if (errorCode7(error) === "ENOENT") {
        return [];
      }
      throw error;
    }
    if (text4.length === 0) {
      return [];
    }
    if (!text4.endsWith("\n")) {
      throw new BrainStorageCorruptionError("Brain audit log has a truncated trailing record");
    }
    const events = text4.slice(0, -1).split("\n").map((line) => parseBrainAuditEvent(JSON.parse(line)));
    for (const [index, event] of events.entries()) {
      if (BigInt(event.sequence) !== BigInt(index + 1)) {
        throw new BrainStorageCorruptionError(`Brain audit sequence mismatch at line ${index + 1}`);
      }
    }
    return events;
  }
  async latestSequence() {
    return (await this.readAll()).at(-1)?.sequence ?? "0";
  }
  async enqueue(fn) {
    const previous = this.queue;
    let release;
    this.queue = new Promise((resolve11) => {
      release = resolve11;
    });
    await previous.catch(() => void 0);
    try {
      return await fn();
    } finally {
      release();
    }
  }
};
function errorCode7(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/hub/brain/file-source-store.ts
import { access as access3, mkdir as mkdir13, readFile as readFile12, readdir as readdir7, rename as rename6, rm as rm9 } from "node:fs/promises";
import { dirname as dirname13, join as join25, relative as relative4, resolve as resolve8, sep as sep2 } from "node:path";

// src/hub/brain/markdown.ts
var delimiter2 = "---\n";
function serializeBrainMarkdown(artifact) {
  const { content, ...metadata2 } = artifact;
  return `${delimiter2}${JSON.stringify(metadata2)}
${delimiter2}${content}`;
}
function parseBrainMarkdown(text4) {
  if (!text4.startsWith(delimiter2)) {
    return null;
  }
  const end = text4.indexOf(`
${delimiter2}`, delimiter2.length);
  if (end === -1) {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter is unterminated");
  }
  let metadata2;
  try {
    metadata2 = JSON.parse(text4.slice(delimiter2.length, end));
  } catch {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter is malformed");
  }
  const content = text4.slice(end + delimiter2.length + 1);
  const artifact = parseBrainArtifact({ ...recordMetadata(metadata2), content });
  return { ...artifact, contentHash: hashBrainContent(content) };
}
function recordMetadata(value) {
  if (!isRecord7(value)) {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter must be an object");
  }
  return value;
}
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/brain/file-source-store.ts
var FileBrainSourceStore = class {
  constructor(root4) {
    this.root = root4;
    this.layout = brainLayout(root4);
  }
  root;
  layout;
  paths = /* @__PURE__ */ new Map();
  async initialize() {
    await Promise.all([
      mkdir13(this.layout.inbox, { recursive: true }),
      mkdir13(this.layout.curated, { recursive: true }),
      mkdir13(this.layout.staging, { recursive: true })
    ]);
    await this.list();
  }
  async stage(operationId, artifact) {
    validateArtifactId(operationId);
    this.resolveArtifactPath(artifact);
    await atomicWriteFile(this.stagedPath(operationId), serializeBrainMarkdown(artifact), { mode: 384 });
  }
  async commit(operationId, artifact, base) {
    validateArtifactId(operationId);
    const finalPath = this.resolveArtifactPath(artifact);
    const committed = await this.readPath(finalPath);
    if (committed && committed.id === artifact.id && committed.revision === artifact.revision && committed.contentHash === artifact.contentHash) {
      await this.cleanupStage(operationId);
      this.paths.set(artifact.id, finalPath);
      return;
    }
    if (!await this.hasStaged(operationId)) {
      throw new BrainStorageCorruptionError(`Pending operation ${operationId} has neither staged nor committed content`);
    }
    if (base && (!committed || committed.revision !== base.revision || committed.contentHash !== base.contentHash)) {
      throw new BrainRevisionConflictError(
        base.revision,
        committed?.revision ?? "0",
        base.contentHash,
        committed?.contentHash
      );
    }
    if (!base && committed) {
      throw new BrainStorageCorruptionError(`Capture target ${artifact.id} already exists`);
    }
    await mkdir13(dirname13(finalPath), { recursive: true });
    await rename6(this.stagedPath(operationId), finalPath);
    await syncDirectory(dirname13(finalPath));
    this.paths.set(artifact.id, finalPath);
  }
  async read(artifactId2) {
    validateArtifactId(artifactId2);
    let path = this.paths.get(artifactId2);
    if (!path) {
      await this.list();
      path = this.paths.get(artifactId2);
    }
    return path ? await this.readPath(path) : null;
  }
  async list() {
    const artifacts = [];
    this.paths.clear();
    for (const directory of [this.layout.inbox, this.layout.curated]) {
      for (const path of await markdownFiles(directory)) {
        const artifact = await this.readPath(path);
        if (!artifact) {
          continue;
        }
        const expectedPath = relative4(this.root, path).split(sep2).join("/");
        if (artifact.path !== expectedPath) {
          throw new BrainStorageCorruptionError(`Artifact ${artifact.id} path metadata does not match ${expectedPath}`);
        }
        if (this.paths.has(artifact.id)) {
          throw new BrainStorageCorruptionError(`Duplicate brain artifact ID ${artifact.id}`);
        }
        this.paths.set(artifact.id, path);
        artifacts.push(artifact);
      }
    }
    return artifacts;
  }
  async hasStaged(operationId) {
    try {
      await access3(this.stagedPath(operationId));
      return true;
    } catch (error) {
      if (errorCode8(error) === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
  async cleanupStage(operationId) {
    await rm9(this.stagedPath(operationId), { force: true });
    await syncDirectory(this.layout.staging);
  }
  async cleanupOrphanStages(activeOperationIds) {
    for (const entry of await readdir7(this.layout.staging, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const operationId = entry.name.slice(0, -3);
      if (!activeOperationIds.has(operationId)) {
        await rm9(join25(this.layout.staging, entry.name), { force: true });
      }
    }
    await syncDirectory(this.layout.staging);
  }
  stagedPath(operationId) {
    validateArtifactId(operationId);
    return join25(this.layout.staging, `${operationId}.md`);
  }
  resolveArtifactPath(artifact) {
    validateArtifactId(artifact.id);
    const resolved = resolve8(this.root, artifact.path);
    const rootPrefix = `${resolve8(this.root)}${sep2}`;
    if (!resolved.startsWith(rootPrefix)) {
      throw new BrainStorageCorruptionError(`Artifact ${artifact.id} escapes the brain root`);
    }
    const relativePath = relative4(this.root, resolved).split(sep2).join("/");
    if (!relativePath.startsWith("vault/inbox/") && !relativePath.startsWith("vault/curated/")) {
      throw new BrainStorageCorruptionError(`Artifact ${artifact.id} is outside the managed vault`);
    }
    return resolved;
  }
  async readPath(path) {
    let text4;
    try {
      text4 = await readFile12(path, "utf8");
    } catch (error) {
      if (errorCode8(error) === "ENOENT") {
        return null;
      }
      throw error;
    }
    return parseBrainMarkdown(text4);
  }
};
async function markdownFiles(directory) {
  const paths = [];
  for (const entry of await readdir7(directory, { withFileTypes: true })) {
    const path = join25(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await markdownFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(path);
    }
  }
  return paths.sort();
}
function errorCode8(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}

// src/hub/brain/input-validation.ts
function validateCaptureInput(input) {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  if (!isBrainArtifactType(input.type)) {
    throw new BrainValidationError("type is not a supported brain artifact type");
  }
  if (!isBrainSensitivity(input.sensitivity)) {
    throw new BrainValidationError("sensitivity is not supported");
  }
  if (input.layer !== void 0 && !isBrainArtifactLayer(input.layer)) {
    throw new BrainValidationError("layer is not a supported brain artifact layer");
  }
  validateTitle(input.title);
  validateContent(input.content);
  validateBrainJsonRecord(input.frontmatter ?? {}, "frontmatter");
  validateBrainJsonRecord(input.provenance, "provenance");
  validateTypedMetadata({
    id: "00000000-0000-0000-0000-000000000000",
    type: input.type,
    layer: input.layer ?? defaultBrainLayer(input.type),
    path: "vault/inbox/00000000-0000-0000-0000-000000000000.md",
    revision: "1",
    contentHash: "sha256:0",
    title: input.title,
    content: input.content,
    frontmatter: input.frontmatter ?? {},
    provenance: input.provenance,
    ...input.source === void 0 ? {} : { source: input.source },
    details: input.details ?? { kind: "none" },
    sensitivity: input.sensitivity,
    createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    createdBy: input.actor.actorId,
    updatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    updatedBy: input.actor.actorId
  });
}
function validateUpdateInput(input) {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  validateArtifactId(input.artifactId);
  validateRevision(input.baseRevision, "baseRevision");
  if (input.type !== void 0 && !isBrainArtifactType(input.type)) {
    throw new BrainValidationError("type is not a supported brain artifact type");
  }
  if (input.sensitivity !== void 0 && !isBrainSensitivity(input.sensitivity)) {
    throw new BrainValidationError("sensitivity is not supported");
  }
  if (input.layer !== void 0 && !isBrainArtifactLayer(input.layer)) {
    throw new BrainValidationError("layer is not a supported brain artifact layer");
  }
  if (input.title !== void 0) {
    validateTitle(input.title);
  }
  if (input.content !== void 0) {
    validateContent(input.content);
  }
  if (input.frontmatter !== void 0) {
    validateBrainJsonRecord(input.frontmatter, "frontmatter");
  }
  if (input.provenance !== void 0) {
    validateBrainJsonRecord(input.provenance, "provenance");
  }
  if (input.details !== void 0) {
    validateDetailsShape(input.details);
  }
}
function validateLinkInput(input) {
  validateActor(input.actor);
  validateRequestId(input.requestId);
  validateArtifactId(input.sourceArtifactId);
  validateArtifactId(input.targetArtifactId);
  validateRelationship(input.relationship);
}
function validateTypedMetadata(artifact) {
  try {
    parseBrainArtifact(artifact);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}
function validateDetailsShape(details) {
  try {
    parseBrainArtifactDetails(details);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}

// src/hub/brain/operation.ts
function createArtifactOperation(action, actor, requestId2, payloadHash, artifact, createdAt, base) {
  return {
    version: 1,
    operationId: deterministicBrainId("operation", actor.actorId, requestId2),
    action,
    actor,
    requestId: requestId2,
    payloadHash,
    artifact,
    ...base ? { base } : {},
    event: {
      eventId: deterministicBrainId("event", actor.actorId, requestId2),
      kind: action === "capture" ? "brain.captured" : "brain.updated",
      actor,
      resource: { kind: "brain-artifact", id: artifact.id, revision: artifact.revision },
      requestId: requestId2,
      payloadHash,
      createdAt
    },
    createdAt
  };
}
function pendingOperationResult(operation, eventSequence) {
  return operation.action === "link" ? { kind: "link", link: operation.link, eventSequence } : { kind: "artifact", artifact: withoutContent(operation.artifact), eventSequence };
}
function requireArtifactResult(result) {
  if (result.kind !== "artifact") {
    throw new BrainStorageCorruptionError("Artifact request replayed a link result");
  }
  return result;
}
function requireLinkResult(result) {
  if (result.kind !== "link") {
    throw new BrainStorageCorruptionError("Link request replayed an artifact result");
  }
  return result;
}

// src/hub/brain/operation-executor.ts
var BrainOperationExecutor = class {
  constructor(source, audit, journal, index, faultInjector) {
    this.source = source;
    this.audit = audit;
    this.journal = journal;
    this.index = index;
    this.faultInjector = faultInjector;
  }
  source;
  audit;
  journal;
  index;
  faultInjector;
  async prepare(operation) {
    await this.source.stage(operation.operationId, operation.artifact);
    await this.journal.write(operation);
  }
  async finalize(operation) {
    if (operation.action !== "link") {
      await this.faultInjector?.("beforeRename", operation);
      await this.source.commit(operation.operationId, operation.artifact, operation.base);
      await this.faultInjector?.("afterRename", operation);
    }
    const event = await this.audit.append(operation.event, pendingOperationResult(operation, "0"));
    await this.faultInjector?.("afterAudit", operation);
    await this.index.commit(operation, event);
    await this.faultInjector?.("afterIndexCommit", operation);
    if (operation.action !== "link") {
      await this.source.cleanupStage(operation.operationId);
    }
    await this.journal.remove(operation.operationId);
    return event.result;
  }
  async recoverPending() {
    const operations = await this.journal.list();
    for (const operation of operations) {
      await this.finalize(operation);
    }
    await this.source.cleanupOrphanStages(/* @__PURE__ */ new Set());
  }
};

// src/hub/brain/operation-journal.ts
import { mkdir as mkdir14, readFile as readFile13, readdir as readdir8, rm as rm10 } from "node:fs/promises";
import { join as join26 } from "node:path";
var FileBrainOperationJournal = class {
  directory;
  constructor(root4) {
    this.directory = brainLayout(root4).pending;
  }
  async initialize() {
    await mkdir14(this.directory, { recursive: true });
  }
  async write(operation) {
    validateArtifactId(operation.operationId);
    await atomicWriteJson(this.path(operation.operationId), operation, { mode: 384 });
  }
  async list() {
    const operations = [];
    for (const entry of (await readdir8(this.directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const value = JSON.parse(await readFile13(join26(this.directory, entry.name), "utf8"));
      operations.push(parseBrainPendingOperation(value));
    }
    return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.operationId.localeCompare(right.operationId));
  }
  async remove(operationId) {
    await rm10(this.path(operationId), { force: true });
    await syncDirectory(this.directory);
  }
  path(operationId) {
    validateArtifactId(operationId);
    return join26(this.directory, `${operationId}.json`);
  }
};

// src/hub/brain/retrieval-input-validation.ts
function validateRetrievalInput(input) {
  if (input.tier !== void 0 && input.tier !== "quick" && input.tier !== "standard" && input.tier !== "deep") {
    throw new BrainValidationError("tier is not a supported brain retrieval tier");
  }
  if (input.limit !== void 0 && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 40)) {
    throw new BrainValidationError("limit must be an integer between 1 and 40");
  }
  for (const type of input.filters?.types ?? []) {
    if (!isBrainArtifactType(type)) throw new BrainValidationError("filters.types contains an unsupported brain artifact type");
  }
  for (const layer of input.filters?.layers ?? []) {
    if (!isBrainArtifactLayer(layer)) throw new BrainValidationError("filters.layers contains an unsupported brain artifact layer");
  }
  for (const sensitivity2 of input.filters?.sensitivities ?? []) {
    if (!isBrainSensitivity(sensitivity2)) throw new BrainValidationError("filters.sensitivities contains an unsupported brain sensitivity");
  }
  for (const status of input.filters?.statuses ?? []) {
    if (status !== "draft" && status !== "accepted" && status !== "disputed" && status !== "superseded") {
      throw new BrainValidationError("filters.statuses contains an unsupported knowledge status");
    }
  }
  validateIsoBoundary(input.filters?.updatedAfter, "filters.updatedAfter");
  validateIsoBoundary(input.filters?.updatedBefore, "filters.updatedBefore");
}
function validateIsoBoundary(value, field) {
  if (value === void 0) return;
  if (!Number.isFinite(Date.parse(value))) throw new BrainValidationError(`${field} must be an ISO timestamp`);
}

// src/hub/brain/sqlite-index.ts
import { mkdir as mkdir15 } from "node:fs/promises";
import { dirname as dirname14 } from "node:path";

// src/hub/brain/sqlite-schema.ts
var BRAIN_SQLITE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  revision TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS artifact_fts USING fts5(
  artifact_id UNINDEXED,
  title,
  content,
  type,
  provenance,
  tokenize = 'unicode61'
);
CREATE TABLE IF NOT EXISTS audit_events (
  sequence TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY (actor_id, request_id)
);
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  link_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS links_source_idx ON links(source_artifact_id);
CREATE INDEX IF NOT EXISTS links_target_idx ON links(target_artifact_id);
`;

// src/hub/brain/sqlite-runtime.ts
async function openBrainSqlite(path) {
  const specifier = "node:sqlite";
  const module = await import(specifier);
  if (!isRecord8(module) || typeof module.DatabaseSync !== "function") {
    throw new BrainStorageCorruptionError("The Hub runtime does not provide node:sqlite DatabaseSync");
  }
  const database = Reflect.construct(module.DatabaseSync, [path]);
  assertDatabase(database);
  return database;
}
function assertDatabase(value) {
  if (!isRecord8(value) || typeof value.exec !== "function" || typeof value.prepare !== "function" || typeof value.close !== "function") {
    throw new BrainStorageCorruptionError("node:sqlite returned an invalid database adapter");
  }
}
function isRecord8(value) {
  return typeof value === "object" && value !== null;
}

// src/hub/brain/sqlite-index.ts
var SqliteBrainMetadataIndex = class {
  path;
  database = null;
  constructor(root4) {
    this.path = brainLayout(root4).sqlite;
  }
  async initialize() {
    await mkdir15(dirname14(this.path), { recursive: true });
    this.database = await openBrainSqlite(this.path);
    this.database.exec(BRAIN_SQLITE_SCHEMA);
  }
  async close() {
    this.database?.close();
    this.database = null;
  }
  async getIdempotency(actorId, requestId2) {
    const row = this.statement("SELECT payload_hash, result_json FROM idempotency WHERE actor_id = ? AND request_id = ?").get(actorId, requestId2);
    if (row === void 0) {
      return null;
    }
    const record = rowRecord(row);
    return {
      actorId,
      requestId: requestId2,
      payloadHash: textColumn(record, "payload_hash"),
      result: parseBrainMutationResult(JSON.parse(textColumn(record, "result_json")))
    };
  }
  async getArtifactMetadata(artifactId2) {
    const row = this.statement("SELECT metadata_json FROM artifacts WHERE id = ?").get(artifactId2);
    if (row === void 0) {
      return null;
    }
    return parseBrainArtifactMetadata(JSON.parse(textColumn(rowRecord(row), "metadata_json")));
  }
  async commit(operation, event) {
    this.transaction(() => {
      if (operation.action === "link") {
        this.upsertLink(operation.link);
      } else {
        this.upsertArtifact(operation.artifact);
      }
      this.insertEvent(event);
      this.insertIdempotency(event);
    });
  }
  async rebuild(artifacts, events) {
    this.transaction(() => {
      this.databaseOrThrow().exec("DELETE FROM artifact_fts; DELETE FROM artifacts; DELETE FROM links; DELETE FROM audit_events; DELETE FROM idempotency;");
      for (const artifact of artifacts) {
        this.upsertArtifact(artifact);
      }
      for (const event of events) {
        if (event.result.kind === "link") {
          this.upsertLink(event.result.link);
        }
        this.insertEvent(event);
        this.insertIdempotency(event);
      }
    });
  }
  async search(query2, type, limit) {
    const ftsQuery = toFtsQuery(query2);
    const rows = this.statement(`
      SELECT a.metadata_json, snippet(artifact_fts, 2, '', '', ' ... ', 18) AS excerpt
      FROM artifact_fts
      JOIN artifacts a ON a.id = artifact_fts.artifact_id
      WHERE artifact_fts MATCH ? AND (? IS NULL OR a.type = ?)
      ORDER BY bm25(artifact_fts), a.updated_at DESC, a.id ASC
      LIMIT ?
    `).all(ftsQuery, type ?? null, type ?? null, limit);
    return rows.map((row) => {
      const record = rowRecord(row);
      return {
        ...parseBrainArtifactMetadata(JSON.parse(textColumn(record, "metadata_json"))),
        excerpt: textColumn(record, "excerpt")
      };
    });
  }
  async links(artifactId2) {
    return this.statement(`
      SELECT link_json FROM links
      WHERE source_artifact_id = ? OR target_artifact_id = ?
      ORDER BY id ASC
    `).all(artifactId2, artifactId2).map((row) => parseLink(JSON.parse(textColumn(rowRecord(row), "link_json"))));
  }
  async healthSnapshot() {
    return {
      artifactIds: this.statement("SELECT id FROM artifacts ORDER BY id ASC").all().map((row) => textColumn(rowRecord(row), "id")),
      linkIds: this.statement("SELECT id FROM links ORDER BY id ASC").all().map((row) => textColumn(rowRecord(row), "id")),
      eventSequences: this.statement("SELECT sequence FROM audit_events ORDER BY sequence ASC").all().map((row) => textColumn(rowRecord(row), "sequence")),
      idempotencyKeys: this.statement("SELECT actor_id, request_id FROM idempotency ORDER BY actor_id ASC, request_id ASC").all().map((row) => {
        const record = rowRecord(row);
        return `${textColumn(record, "actor_id")}\0${textColumn(record, "request_id")}`;
      })
    };
  }
  upsertArtifact(artifact) {
    const metadata2 = withoutContent(artifact);
    this.statement("DELETE FROM artifact_fts WHERE artifact_id = ?").run(artifact.id);
    this.statement(`
      INSERT INTO artifacts (
        id, path, revision, content_hash, type, title, sensitivity,
        provenance_json, metadata_json, content, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        revision = excluded.revision,
        content_hash = excluded.content_hash,
        type = excluded.type,
        title = excluded.title,
        sensitivity = excluded.sensitivity,
        provenance_json = excluded.provenance_json,
        metadata_json = excluded.metadata_json,
        content = excluded.content,
        updated_at = excluded.updated_at
    `).run(
      artifact.id,
      artifact.path,
      artifact.revision,
      artifact.contentHash,
      artifact.type,
      artifact.title,
      artifact.sensitivity,
      JSON.stringify(artifact.provenance),
      JSON.stringify(metadata2),
      artifact.content,
      artifact.updatedAt
    );
    this.statement("INSERT INTO artifact_fts (artifact_id, title, content, type, provenance) VALUES (?, ?, ?, ?, ?)").run(artifact.id, artifact.title, artifact.content, artifact.type, JSON.stringify({
      layer: artifact.layer,
      provenance: artifact.provenance,
      source: artifact.source ?? null,
      details: artifact.details
    }));
  }
  upsertLink(link) {
    this.statement(`
      INSERT INTO links (id, source_artifact_id, target_artifact_id, relationship, link_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET link_json = excluded.link_json
    `).run(link.id, link.sourceArtifactId, link.targetArtifactId, link.relationship, JSON.stringify(link));
  }
  insertEvent(event) {
    this.statement("INSERT OR IGNORE INTO audit_events (sequence, event_id, event_json) VALUES (?, ?, ?)").run(event.sequence, event.eventId, JSON.stringify(event));
  }
  insertIdempotency(event) {
    this.statement(`
      INSERT OR IGNORE INTO idempotency (actor_id, request_id, payload_hash, result_json)
      VALUES (?, ?, ?, ?)
    `).run(event.actor.actorId, event.requestId, event.payloadHash, JSON.stringify(event.result));
  }
  statement(sql) {
    const statement = this.databaseOrThrow().prepare(sql);
    if (!isRecord9(statement) || typeof statement.run !== "function" || typeof statement.get !== "function" || typeof statement.all !== "function") {
      throw new BrainStorageCorruptionError("node:sqlite returned an invalid statement");
    }
    const run2 = statement.run;
    const get = statement.get;
    const all = statement.all;
    return {
      run(...parameters) {
        return Reflect.apply(run2, statement, parameters);
      },
      get(...parameters) {
        return Reflect.apply(get, statement, parameters);
      },
      all(...parameters) {
        const rows = Reflect.apply(all, statement, parameters);
        if (!Array.isArray(rows)) {
          throw new BrainStorageCorruptionError("node:sqlite returned malformed rows");
        }
        return rows;
      }
    };
  }
  databaseOrThrow() {
    if (!this.database) {
      throw new BrainStorageCorruptionError("Brain SQLite index is not initialized");
    }
    return this.database;
  }
  transaction(fn) {
    const database = this.databaseOrThrow();
    database.exec("BEGIN IMMEDIATE");
    try {
      fn();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
};
function toFtsQuery(query2) {
  const tokens = query2.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  if (tokens.length === 0) {
    throw new BrainStorageCorruptionError("Search query contains no indexable terms");
  }
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");
}
function parseLink(value) {
  if (!isRecord9(value) || typeof value.id !== "string" || typeof value.sourceArtifactId !== "string" || typeof value.targetArtifactId !== "string" || typeof value.relationship !== "string" || typeof value.createdAt !== "string" || typeof value.createdBy !== "string") {
    throw new BrainStorageCorruptionError("Brain link index row is malformed");
  }
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}
function rowRecord(value) {
  if (!isRecord9(value)) {
    throw new BrainStorageCorruptionError("Brain SQLite row is malformed");
  }
  return value;
}
function textColumn(row, column) {
  const value = row[column];
  if (typeof value !== "string") {
    throw new BrainStorageCorruptionError(`Brain SQLite column ${column} is malformed`);
  }
  return value;
}
function isRecord9(value) {
  return typeof value === "object" && value !== null;
}

// src/hub/brain/service.ts
var BrainService = class {
  constructor(permissions, source, audit, journal, index, projection, clock, faultInjector) {
    this.permissions = permissions;
    this.source = source;
    this.audit = audit;
    this.journal = journal;
    this.index = index;
    this.projection = projection;
    this.clock = clock;
    this.faultInjector = faultInjector;
    this.executor = new BrainOperationExecutor(source, audit, journal, index, faultInjector);
    this.retrieval = new BrainRetrievalService(source, audit, index, clock);
  }
  permissions;
  source;
  audit;
  journal;
  index;
  projection;
  clock;
  faultInjector;
  queue = Promise.resolve();
  executor;
  retrieval;
  async initialize() {
    await this.source.initialize();
    await this.audit.initialize();
    await this.journal.initialize();
    await this.index.initialize();
    await this.executor.recoverPending();
    const artifacts = await this.source.list();
    await this.index.rebuild(artifacts, await this.audit.readAll());
    await this.initializeProjection(artifacts);
  }
  async close() {
    await this.index.close();
  }
  async capture(input) {
    validateCaptureInput(input);
    await this.permissions.requireWrite(input.actor, "capture");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "capture",
        type: input.type,
        title: input.title,
        content: input.content,
        layer: input.layer,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        source: input.source,
        details: input.details ?? { kind: "none" },
        sensitivity: input.sensitivity
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireArtifactResult(replay);
      }
      const contentHash = hashBrainContent(input.content);
      const existingSource = input.type === "source" ? await this.findSourceByContentHash(contentHash) : null;
      if (existingSource) {
        if (existingSource.sensitivity !== input.sensitivity) {
          throw new BrainSourceSensitivityMismatchError(contentHash);
        }
        const operation2 = createArtifactOperation("capture", input.actor, input.requestId, payloadHash, existingSource, this.clock().toISOString());
        await this.projection?.markDirty();
        await this.executor.prepare(operation2);
        const result2 = requireArtifactResult(await this.executor.finalize(operation2));
        await this.refreshProjection();
        return result2;
      }
      const artifactId2 = input.type === "source" ? deterministicBrainId("source-artifact", "content", contentHash) : deterministicBrainId("artifact", input.actor.actorId, input.requestId);
      if (await this.source.read(artifactId2)) {
        throw new BrainStorageCorruptionError(`Artifact ID ${artifactId2} exists without an idempotency record`);
      }
      const now = this.clock().toISOString();
      const artifact = {
        id: artifactId2,
        type: input.type,
        layer: input.layer ?? defaultBrainLayer(input.type),
        path: `vault/inbox/${artifactId2}.md`,
        revision: "1",
        contentHash,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        ...input.source === void 0 ? {} : { source: input.source },
        details: input.details ?? { kind: "none" },
        sensitivity: input.sensitivity,
        createdAt: now,
        createdBy: input.actor.actorId,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      const operation = createArtifactOperation("capture", input.actor, input.requestId, payloadHash, artifact, now);
      await this.projection?.markDirty();
      await this.executor.prepare(operation);
      const result = requireArtifactResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
    });
  }
  async update(input) {
    validateUpdateInput(input);
    await this.permissions.requireWrite(input.actor, "update");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "update",
        artifactId: input.artifactId,
        baseRevision: input.baseRevision,
        type: input.type,
        layer: input.layer,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter,
        provenance: input.provenance,
        details: input.details,
        sensitivity: input.sensitivity
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireArtifactResult(replay);
      }
      const current = await this.source.read(input.artifactId);
      if (!current) {
        throw new BrainNotFoundError(input.artifactId);
      }
      if (immutableSourceType(current.type) || input.type !== void 0 && immutableSourceType(input.type)) {
        throw new BrainImmutableSourceError(input.artifactId);
      }
      if (current.revision !== input.baseRevision) {
        throw new BrainRevisionConflictError(input.baseRevision, current.revision);
      }
      const indexed = await this.index.getArtifactMetadata(input.artifactId);
      if (indexed && indexed.contentHash !== current.contentHash) {
        throw new BrainRevisionConflictError(input.baseRevision, current.revision, indexed.contentHash, current.contentHash);
      }
      const now = this.clock().toISOString();
      const content = input.content ?? current.content;
      const type = input.type ?? current.type;
      const details = input.details ?? (input.type === void 0 ? current.details : { kind: "none" });
      const artifact = {
        ...current,
        type,
        layer: input.layer ?? (input.type === void 0 ? current.layer : defaultBrainLayer(type)),
        revision: (BigInt(current.revision) + 1n).toString(),
        contentHash: hashBrainContent(content),
        title: input.title ?? current.title,
        content,
        frontmatter: input.frontmatter ?? current.frontmatter,
        provenance: input.provenance ?? current.provenance,
        details,
        sensitivity: input.sensitivity ?? current.sensitivity,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      validateMergedArtifact(artifact);
      const operation = createArtifactOperation("update", input.actor, input.requestId, payloadHash, artifact, now, {
        revision: current.revision,
        contentHash: current.contentHash
      });
      await this.projection?.markDirty();
      await this.executor.prepare(operation);
      const result = requireArtifactResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
    });
  }
  async link(input) {
    validateLinkInput(input);
    await this.permissions.requireWrite(input.actor, "link");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "link",
        sourceArtifactId: input.sourceArtifactId,
        targetArtifactId: input.targetArtifactId,
        relationship: input.relationship
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireLinkResult(replay);
      }
      if (!await this.source.read(input.sourceArtifactId)) {
        throw new BrainNotFoundError(input.sourceArtifactId);
      }
      if (!await this.source.read(input.targetArtifactId)) {
        throw new BrainNotFoundError(input.targetArtifactId);
      }
      const now = this.clock().toISOString();
      const operationId = deterministicBrainId("operation", input.actor.actorId, input.requestId);
      const linkId = deterministicBrainId("link", input.actor.actorId, input.requestId);
      const operation = {
        version: 1,
        operationId,
        action: "link",
        actor: input.actor,
        requestId: input.requestId,
        payloadHash,
        link: {
          id: linkId,
          sourceArtifactId: input.sourceArtifactId,
          targetArtifactId: input.targetArtifactId,
          relationship: input.relationship,
          createdAt: now,
          createdBy: input.actor.actorId
        },
        event: {
          eventId: deterministicBrainId("event", input.actor.actorId, input.requestId),
          kind: "brain.linked",
          actor: input.actor,
          resource: { kind: "brain-link", id: linkId },
          requestId: input.requestId,
          payloadHash,
          createdAt: now
        },
        createdAt: now
      };
      await this.projection?.markDirty();
      await this.journal.write(operation);
      const result = requireLinkResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
    });
  }
  async read(input) {
    validateActor(input.actor);
    validateArtifactId(input.artifactId);
    await this.permissions.requireRead(input.actor);
    const artifact = await this.source.read(input.artifactId);
    if (!artifact) {
      throw new BrainNotFoundError(input.artifactId);
    }
    return artifact;
  }
  async search(input) {
    validateActor(input.actor);
    validateSearchQuery(input.query);
    if (input.type !== void 0 && !isBrainArtifactType(input.type)) {
      throw new BrainValidationError("type is not a supported brain artifact type");
    }
    await this.permissions.requireRead(input.actor);
    const requestedLimit = input.limit ?? 20;
    const limit = Math.min(50, Math.max(1, Number.isInteger(requestedLimit) ? requestedLimit : 20));
    return await this.index.search(input.query, input.type, limit);
  }
  async retrieve(input) {
    validateActor(input.actor);
    validateSearchQuery(input.query);
    validateRetrievalInput(input);
    await this.permissions.requireRead(input.actor);
    return await this.retrieval.retrieve(input);
  }
  async health(input) {
    validateActor(input.actor);
    await this.permissions.requireRead(input.actor);
    return await this.retrieval.health();
  }
  async list(input) {
    validateActor(input.actor);
    if (input.type !== void 0 && !isBrainArtifactType(input.type)) {
      throw new BrainValidationError("type is not a supported brain artifact type");
    }
    await this.permissions.requireRead(input.actor);
    const artifacts = await this.source.list();
    return artifacts.filter((artifact) => input.type === void 0 || artifact.type === input.type).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id));
  }
  async links(input) {
    validateActor(input.actor);
    validateArtifactId(input.artifactId);
    await this.permissions.requireRead(input.actor);
    if (!await this.source.read(input.artifactId)) {
      throw new BrainNotFoundError(input.artifactId);
    }
    return await this.index.links(input.artifactId);
  }
  async latestEventSequence() {
    return await this.audit.latestSequence();
  }
  async replay(actor, requestId2, payloadHash) {
    const existing = await this.index.getIdempotency(actor.actorId, requestId2);
    if (!existing) {
      return null;
    }
    if (existing.payloadHash !== payloadHash) {
      throw new BrainIdempotencyConflictError(actor.actorId, requestId2);
    }
    return existing.result;
  }
  async enqueue(fn) {
    const previous = this.queue;
    let release;
    const current = new Promise((resolve11) => {
      release = resolve11;
    });
    this.queue = previous.then(() => current, () => current);
    await previous.catch(() => void 0);
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async findSourceByContentHash(contentHash) {
    return (await this.source.list()).find((artifact) => artifact.type === "source" && artifact.contentHash === contentHash) ?? null;
  }
  async refreshProjection() {
    try {
      await this.projection?.refresh(await this.source.list());
    } catch {
      return;
    }
  }
  async initializeProjection(artifacts) {
    try {
      await this.projection?.initialize(artifacts);
    } catch {
      try {
        await this.projection?.markDirty();
      } catch {
        return;
      }
    }
  }
};
async function createBrainService(dependencies) {
  const service = new BrainService(
    dependencies.permissions,
    dependencies.sourceStore ?? new FileBrainSourceStore(dependencies.root),
    dependencies.audit ?? new JsonlBrainAuditLog(dependencies.root),
    dependencies.journal ?? new FileBrainOperationJournal(dependencies.root),
    dependencies.index ?? new SqliteBrainMetadataIndex(dependencies.root),
    dependencies.projection,
    dependencies.clock ?? (() => /* @__PURE__ */ new Date()),
    dependencies.faultInjector
  );
  try {
    await service.initialize();
    return service;
  } catch (error) {
    await service.close();
    throw error;
  }
}
function validateMergedArtifact(artifact) {
  try {
    parseBrainArtifact(artifact);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}
function immutableSourceType(type) {
  return type === "source" || type === "source-observation";
}

// src/hub/mcp/errors.ts
var BrainMcpError = class extends Error {
  constructor(code, message2, details) {
    super(message2);
    this.code = code;
    this.details = details;
  }
  code;
  details;
};

// src/hub/adapter-schema.ts
var uuidPattern2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var artifactTypes2 = new Set(brainArtifactTypes);
var artifactLayers3 = new Set(brainArtifactLayers);
var sensitivities2 = /* @__PURE__ */ new Set(["private", "tailnet", "restricted"]);
function isCanonicalUuid(value) {
  return typeof value === "string" && uuidPattern2.test(value);
}
function isBrainArtifactType2(value) {
  return typeof value === "string" && artifactTypes2.has(value);
}
function isBrainArtifactLayer2(value) {
  return typeof value === "string" && artifactLayers3.has(value);
}
function isBrainSensitivity2(value) {
  return typeof value === "string" && sensitivities2.has(value);
}
function isJsonRecord2(value) {
  return isRecord10(value) && Object.values(value).every(isJsonValue2);
}
function isRecord10(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys(value, allowedKeys) {
  return Object.keys(value).filter((key) => !allowedKeys.includes(key)).sort();
}
function isJsonValue2(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue2);
  return isJsonRecord2(value);
}

// src/policy/workflow-proof-schema.ts
function parseWorkflowProofDecision(value, invalid2, field = "workflowProof") {
  const record = strictRecord(value, [
    "schemaVersion",
    "decisionId",
    "idempotencyKey",
    "verdict",
    "workflow",
    "candidate",
    "verifier",
    "provenanceHashes",
    "decidedAt"
  ], field, invalid2);
  literal(record.schemaVersion, "skillloom-workflow-proof-v1", `${field}.schemaVersion`, invalid2);
  if (record.verdict !== "passed" && record.verdict !== "failed") throw invalid2(`${field}.verdict is invalid`);
  const workflow = strictRecord(record.workflow, ["artifactId", "revision", "contentHash"], `${field}.workflow`, invalid2);
  const candidate2 = strictRecord(record.candidate, ["candidateId", "packageHash"], `${field}.candidate`, invalid2);
  const verifier = strictRecord(record.verifier, ["kind", "summary", "evidence"], `${field}.verifier`, invalid2);
  if (verifier.kind !== "replay" && verifier.kind !== "held-out-evaluation") throw invalid2(`${field}.verifier.kind is invalid`);
  if (!Array.isArray(record.provenanceHashes)) throw invalid2(`${field}.provenanceHashes must be an array`);
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: text(record.decisionId, `${field}.decisionId`, invalid2),
    idempotencyKey: text(record.idempotencyKey, `${field}.idempotencyKey`, invalid2),
    verdict: record.verdict,
    workflow: {
      artifactId: text(workflow.artifactId, `${field}.workflow.artifactId`, invalid2),
      revision: sequence(workflow.revision, `${field}.workflow.revision`, invalid2),
      contentHash: digest(workflow.contentHash, `${field}.workflow.contentHash`, invalid2)
    },
    candidate: {
      candidateId: text(candidate2.candidateId, `${field}.candidate.candidateId`, invalid2),
      packageHash: packageHash2(candidate2.packageHash, `${field}.candidate.packageHash`, invalid2)
    },
    verifier: {
      kind: verifier.kind,
      summary: text(verifier.summary, `${field}.verifier.summary`, invalid2),
      evidence: text(verifier.evidence, `${field}.verifier.evidence`, invalid2)
    },
    provenanceHashes: record.provenanceHashes.map((item, index) => digest(item, `${field}.provenanceHashes[${index}]`, invalid2)),
    decidedAt: timestamp(record.decidedAt, `${field}.decidedAt`, invalid2)
  };
}
function strictRecord(value, keys, field, invalid2) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid2(`${field} must be an object`);
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) throw invalid2(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys) {
    if (!expected.has(key)) throw invalid2(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || descriptor.get !== void 0 || descriptor.set !== void 0) {
      throw invalid2(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw invalid2(`${field}.${key} is required`);
  }
  return value;
}
function literal(value, expected, field, invalid2) {
  if (value !== expected) throw invalid2(`${field} must equal ${expected}`);
}
function text(value, field, invalid2) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw invalid2(`${field} must be canonical non-empty text`);
  }
  return value;
}
function sequence(value, field, invalid2) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalid2(`${field} must be a canonical nonnegative decimal sequence`);
  }
  return value;
}
function digest(value, field, invalid2) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw invalid2(`${field} must be a SHA-256 digest`);
  return value;
}
function packageHash2(value, field, invalid2) {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) {
    throw invalid2(`${field} must be a sha256-v2 package hash`);
  }
  return value;
}
function timestamp(value, field, invalid2) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw invalid2(`${field} must be a canonical ISO timestamp`);
  }
  return value;
}

// src/hub/mcp/schema.ts
function parseBrainMcpSearch(value) {
  const input = strictObject(value, ["query", "type", "limit"]);
  if (typeof input.query !== "string" || input.type !== void 0 && !isBrainArtifactType2(input.type) || input.limit !== void 0 && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50)) {
    throw validationError("brain_search arguments have invalid field types");
  }
  return {
    query: input.query,
    ...input.type === void 0 ? {} : { type: input.type },
    ...input.limit === void 0 ? {} : { limit: input.limit }
  };
}
function parseBrainMcpRetrieve(value) {
  const input = strictObject(value, ["query", "tier", "limit", "filters"]);
  if (typeof input.query !== "string" || input.tier !== void 0 && input.tier !== "quick" && input.tier !== "standard" && input.tier !== "deep" || input.limit !== void 0 && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 40) || input.filters !== void 0 && !isRecord10(input.filters)) {
    throw validationError("brain_retrieve arguments have invalid field types");
  }
  return {
    query: input.query,
    ...input.tier === void 0 ? {} : { tier: input.tier },
    ...input.limit === void 0 ? {} : { limit: input.limit },
    ...input.filters === void 0 ? {} : { filters: retrieveFilters(input.filters) }
  };
}
function parseBrainMcpHealth(value) {
  strictObject(value, []);
  return {};
}
function parseBrainMcpRead(value) {
  const input = strictObject(value, ["artifactId"]);
  return { artifactId: uuid(input.artifactId, "artifactId") };
}
function parseBrainMcpCapture(value) {
  const input = strictObject(value, ["requestId", "type", "layer", "title", "content", "frontmatter", "provenance", "source", "details", "sensitivity"]);
  if (!isBrainArtifactType2(input.type) || typeof input.title !== "string" || typeof input.content !== "string" || !isJsonRecord2(input.provenance) || !isBrainSensitivity2(input.sensitivity) || input.layer !== void 0 && !isBrainArtifactLayer2(input.layer) || input.source !== void 0 && !isJsonRecord2(input.source) || input.details !== void 0 && !isJsonRecord2(input.details) || input.frontmatter !== void 0 && !isJsonRecord2(input.frontmatter)) {
    throw validationError("brain_capture arguments have invalid field types");
  }
  return {
    requestId: uuid(input.requestId, "requestId"),
    type: input.type,
    ...input.layer === void 0 ? {} : { layer: input.layer },
    title: input.title,
    content: input.content,
    ...input.frontmatter === void 0 ? {} : { frontmatter: input.frontmatter },
    provenance: input.provenance,
    ...input.source === void 0 ? {} : { source: parseSourceInput(input.source) },
    ...input.details === void 0 ? {} : { details: parseDetailsInput(input.details) },
    sensitivity: input.sensitivity
  };
}
function parseBrainMcpUpdate(value) {
  const input = strictObject(value, ["requestId", "artifactId", "baseRevision", "type", "layer", "title", "content", "frontmatter", "provenance", "details", "sensitivity"]);
  if (typeof input.baseRevision !== "string" || input.type !== void 0 && !isBrainArtifactType2(input.type) || input.layer !== void 0 && !isBrainArtifactLayer2(input.layer) || input.title !== void 0 && typeof input.title !== "string" || input.content !== void 0 && typeof input.content !== "string" || input.frontmatter !== void 0 && !isJsonRecord2(input.frontmatter) || input.provenance !== void 0 && !isJsonRecord2(input.provenance) || input.details !== void 0 && !isJsonRecord2(input.details) || input.sensitivity !== void 0 && !isBrainSensitivity2(input.sensitivity)) {
    throw validationError("brain_update arguments have invalid field types");
  }
  return {
    requestId: uuid(input.requestId, "requestId"),
    artifactId: uuid(input.artifactId, "artifactId"),
    baseRevision: input.baseRevision,
    ...input.type === void 0 ? {} : { type: input.type },
    ...input.layer === void 0 ? {} : { layer: input.layer },
    ...input.title === void 0 ? {} : { title: input.title },
    ...input.content === void 0 ? {} : { content: input.content },
    ...input.frontmatter === void 0 ? {} : { frontmatter: input.frontmatter },
    ...input.provenance === void 0 ? {} : { provenance: input.provenance },
    ...input.details === void 0 ? {} : { details: parseDetailsInput(input.details) },
    ...input.sensitivity === void 0 ? {} : { sensitivity: input.sensitivity }
  };
}
function parseBrainMcpLink(value) {
  const input = strictObject(value, ["requestId", "sourceArtifactId", "targetArtifactId", "relationship"]);
  if (typeof input.relationship !== "string") throw validationError("brain_link arguments have invalid field types");
  return {
    requestId: uuid(input.requestId, "requestId"),
    sourceArtifactId: uuid(input.sourceArtifactId, "sourceArtifactId"),
    targetArtifactId: uuid(input.targetArtifactId, "targetArtifactId"),
    relationship: input.relationship
  };
}
function parseRegistryMcpPropose(value) {
  const input = strictObject(value, ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files", "workflowProof"]);
  return {
    requestId: uuid(input.requestId, "requestId"),
    name: text2(input.name, "name"),
    baseReleaseHash: nullablePackageHash(input.baseReleaseHash, "baseReleaseHash"),
    capabilities: capabilities(input.capabilities),
    provenance: provenance(input.provenance),
    files: files(input.files),
    ...input.workflowProof === void 0 ? {} : { workflowProof: parseWorkflowProofDecision(input.workflowProof, validationError) }
  };
}
function parseRegistryMcpPublish(value) {
  const input = strictObject(value, ["requestId", "candidateId", "version", "channel", "workflowProof"]);
  if (input.channel !== "stable") throw validationError("skill_publish channel must be stable");
  return {
    requestId: uuid(input.requestId, "requestId"),
    candidateId: text2(input.candidateId, "candidateId"),
    version: semanticVersion(input.version),
    channel: "stable",
    ...input.workflowProof === void 0 ? {} : { workflowProof: parseWorkflowProofDecision(input.workflowProof, validationError) }
  };
}
function strictObject(value, allowedKeys) {
  if (!isRecord10(value)) throw validationError("Tool arguments must be an object");
  const unknown = unknownKeys(value, allowedKeys);
  if (unknown.length > 0) throw validationError(`Unknown tool arguments: ${unknown.sort().join(", ")}`);
  return value;
}
function uuid(value, field) {
  if (!isCanonicalUuid(value)) throw validationError(`${field} must be a canonical lowercase UUID`);
  return value;
}
function text2(value, field) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw validationError(`${field} must be canonical non-empty text`);
  }
  return value;
}
function nullablePackageHash(value, field) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw validationError(`${field} must be a sha256-v2 package hash or null`);
  return value;
}
function capabilities(value) {
  const allowed = /* @__PURE__ */ new Set(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && allowed.has(item))) {
    throw validationError("capabilities contains an invalid capability");
  }
  if (new Set(value).size !== value.length) throw validationError("capabilities contains a duplicate value");
  return [...value];
}
function provenance(value) {
  if (!Array.isArray(value)) throw validationError("provenance must be an array");
  return value.map((item, index) => {
    const record = strictObject(item, ["artifactId", "revision", "contentHash"]);
    return {
      artifactId: text2(record.artifactId, `provenance[${index}].artifactId`),
      revision: sequence2(record.revision, `provenance[${index}].revision`),
      contentHash: digest2(record.contentHash, `provenance[${index}].contentHash`)
    };
  });
}
function files(value) {
  if (!Array.isArray(value)) throw validationError("files must be an array");
  return value.map((item, index) => {
    const record = strictObject(item, ["relativePath", "mode", "content"]);
    if (record.mode !== 420 && record.mode !== 493) throw validationError(`files[${index}].mode must be 0644 or 0755`);
    return { relativePath: text2(record.relativePath, `files[${index}].relativePath`), mode: record.mode, content: text2(record.content, `files[${index}].content`) };
  });
}
function sequence2(value, field) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw validationError(`${field} must be a canonical nonnegative decimal sequence`);
  return value;
}
function digest2(value, field) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw validationError(`${field} must be a SHA-256 digest`);
  return value;
}
function semanticVersion(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
    throw validationError("version must be a canonical semantic version");
  }
  return value;
}
function validationError(message2) {
  return new BrainMcpError("BRAIN_MCP_VALIDATION_ERROR", message2);
}
function retrieveFilters(value) {
  const input = strictObject(value, ["types", "layers", "sensitivities", "statuses", "updatedAfter", "updatedBefore", "hasSource"]);
  const types = optionalArray(input.types, isBrainArtifactType2, "filters.types");
  const layers = optionalArray(input.layers, isBrainArtifactLayer2, "filters.layers");
  const sensitivities3 = optionalArray(input.sensitivities, isBrainSensitivity2, "filters.sensitivities");
  const statuses = optionalArray(input.statuses, isKnowledgeStatus2, "filters.statuses");
  if (input.updatedAfter !== void 0 && typeof input.updatedAfter !== "string" || input.updatedBefore !== void 0 && typeof input.updatedBefore !== "string" || input.hasSource !== void 0 && typeof input.hasSource !== "boolean") {
    throw validationError("brain_retrieve filters have invalid field types");
  }
  return {
    ...types === void 0 ? {} : { types },
    ...layers === void 0 ? {} : { layers },
    ...sensitivities3 === void 0 ? {} : { sensitivities: sensitivities3 },
    ...statuses === void 0 ? {} : { statuses },
    ...input.updatedAfter === void 0 ? {} : { updatedAfter: input.updatedAfter },
    ...input.updatedBefore === void 0 ? {} : { updatedBefore: input.updatedBefore },
    ...input.hasSource === void 0 ? {} : { hasSource: input.hasSource }
  };
}
function optionalArray(value, validate, field) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || !value.every(validate)) throw validationError(`${field} has invalid field types`);
  return [...new Set(value)];
}
function isKnowledgeStatus2(value) {
  return value === "draft" || value === "accepted" || value === "disputed" || value === "superseded";
}
function parseSourceInput(value) {
  try {
    return parseBrainSourceMetadata(value);
  } catch {
    throw validationError("source metadata has invalid field types");
  }
}
function parseDetailsInput(value) {
  try {
    return parseBrainArtifactDetails(value);
  } catch {
    throw validationError("artifact details have invalid field types");
  }
}

// src/bridge/errors.ts
var BridgeProtocolError = class extends Error {
  constructor(code, message2, data) {
    super(message2);
    this.code = code;
    this.data = data;
  }
  code;
  data;
};
function protocolError(id, error) {
  const body = {
    code: error.code,
    message: error.message,
    ...error.data === void 0 ? {} : { data: error.data }
  };
  return { jsonrpc: "2.0", id, error: body };
}
function remoteToolError(error) {
  const source = errorRecord(error);
  const structuredContent = {
    error: {
      code: typeof source.code === "string" ? source.code : "BRIDGE_REMOTE_ERROR",
      message: error instanceof Error ? error.message : "Remote brain request failed",
      ...isRecord11(source.details) ? { details: source.details } : {}
    }
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}
function errorRecord(error) {
  return typeof error === "object" && error !== null ? error : {};
}
function isRecord11(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/bridge/schema.ts
var brainToolNames = /* @__PURE__ */ new Set([
  "brain_search",
  "brain_retrieve",
  "brain_health",
  "brain_read",
  "brain_capture",
  "brain_update",
  "brain_link"
]);
var skillToolNames = /* @__PURE__ */ new Set(["skill_releases", "skill_read", "skill_propose", "skill_publish"]);
function parseJsonRpcRequest(value) {
  const input = strictObject2(value, ["jsonrpc", "id", "method", "params"], -32600, "Invalid Request");
  if (input.jsonrpc !== "2.0" || typeof input.method !== "string" || input.method.length === 0) {
    throw new BridgeProtocolError(-32600, "Invalid Request");
  }
  const id = input.id === void 0 ? void 0 : parseId(input.id);
  return {
    jsonrpc: "2.0",
    ...id === void 0 ? {} : { id },
    method: input.method,
    ...input.params === void 0 ? {} : { params: input.params }
  };
}
function parseInitializeParams(value) {
  const input = strictParams(value, ["protocolVersion", "capabilities", "clientInfo", "_meta"]);
  const clientInfo = strictObject2(
    input.clientInfo,
    ["name", "version", "title", "description", "websiteUrl", "icons"],
    -32602,
    "Invalid initialize params"
  );
  if (typeof input.protocolVersion !== "string" || input.protocolVersion.length === 0 || !isRecord12(input.capabilities) || typeof clientInfo.name !== "string" || clientInfo.name.length === 0 || typeof clientInfo.version !== "string" || clientInfo.version.length === 0) {
    throw new BridgeProtocolError(-32602, "Invalid initialize params");
  }
  return {
    protocolVersion: input.protocolVersion,
    capabilities: input.capabilities,
    clientInfo: { name: clientInfo.name, version: clientInfo.version }
  };
}
function parseEmptyParams(value) {
  if (value === void 0) return;
  strictParams(value, ["_meta"]);
}
function parseToolCallParams(value) {
  const input = strictParams(value, ["name", "arguments", "_meta"]);
  if (!isToolName(input.name) || !isRecord12(input.arguments)) {
    throw new BridgeProtocolError(-32602, "Invalid tools/call params");
  }
  return { name: input.name, arguments: input.arguments };
}
function requestIdFrom(value) {
  if (!isRecord12(value) || !("id" in value)) return null;
  try {
    return parseId(value.id) ?? null;
  } catch {
    return null;
  }
}
function strictParams(value, keys) {
  return strictObject2(value ?? {}, keys, -32602, "Invalid params");
}
function strictObject2(value, keys, code, message2) {
  if (!isRecord12(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BridgeProtocolError(code, message2);
  }
  return value;
}
function parseId(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new BridgeProtocolError(-32600, "Invalid Request");
}
function isToolName(value) {
  return typeof value === "string" && (brainToolNames.has(value) || skillToolNames.has(value));
}
function isRecord12(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/bridge/server.ts
var defaultSyncTimeoutMs = 5e3;
function createBridgeServer(options) {
  let syncStarted = false;
  return {
    handle: async (message2) => {
      const notification = isNotification(message2);
      try {
        const request = parseJsonRpcRequest(message2);
        if (notification) {
          await handleNotification(request);
          return void 0;
        }
        return await handleRequest(request);
      } catch (error) {
        if (notification) return void 0;
        const mapped = error instanceof BridgeProtocolError ? error : new BridgeProtocolError(-32603, "Internal error");
        return protocolError(requestIdFrom(message2), mapped);
      }
    }
  };
  async function handleRequest(request) {
    const id = request.id;
    if (request.method === "initialize") {
      const params = parseInitializeParams(request.params);
      if (!syncStarted) {
        syncStarted = true;
        void attemptSync(options);
      }
      return success(id, {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "skillloom-bridge", version: "0.3.8" }
      });
    }
    if (request.method === "ping") {
      parseEmptyParams(request.params);
      return success(id, {});
    }
    if (request.method === "tools/list") {
      parseEmptyParams(request.params);
      return success(id, { tools: listBrainMcpTools() });
    }
    if (request.method === "tools/call") {
      const params = parseToolCallParams(request.params);
      const call = {
        name: params.name,
        arguments: params.arguments,
        ...mutationRequestId(params.name, params.arguments)
      };
      try {
        return success(id, await options.remote.call(call));
      } catch (error) {
        return success(id, remoteToolError(error));
      }
    }
    throw new BridgeProtocolError(-32601, "Method not found");
  }
  async function handleNotification(request) {
    if (request.method !== "notifications/initialized") return;
    parseEmptyParams(request.params);
  }
}
async function attemptSync(options) {
  if (options.sync === void 0) return;
  const timeoutMs = options.syncTimeoutMs ?? defaultSyncTimeoutMs;
  const controller = new AbortController();
  let timeout;
  try {
    await Promise.race([
      options.sync.syncOnce(controller.signal),
      new Promise((_resolve, reject2) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject2(new Error("Initial sync timed out"));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    options.diagnose?.(`Initial sync failed: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
}
function success(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function mutationRequestId(name, args) {
  if (name !== "brain_capture" && name !== "brain_update" && name !== "brain_link" && name !== "skill_propose" && name !== "skill_publish") return {};
  return typeof args.requestId === "string" ? { requestId: args.requestId } : {};
}
function isNotification(message2) {
  return typeof message2 === "object" && message2 !== null && !Array.isArray(message2) && message2.jsonrpc === "2.0" && typeof message2.method === "string" && !("id" in message2);
}

// src/bridge/stdio.ts
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
async function runBridgeStdio(options) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const diagnostics = options.diagnostics ?? process.stderr;
  const diagnose = (message2) => {
    diagnostics.write(`${message2}
`);
  };
  const server = createBridgeServer({
    remote: options.remote,
    ...options.sync === void 0 ? {} : { sync: options.sync },
    ...options.syncTimeoutMs === void 0 ? {} : { syncTimeoutMs: options.syncTimeoutMs },
    diagnose
  });
  const decoder = new StringDecoder("utf8");
  let buffered = "";
  for await (const chunk of input) {
    buffered += typeof chunk === "string" ? chunk : decoder.write(chunk);
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) await handleLine(line);
  }
  buffered += decoder.end();
  if (buffered.length > 0) await handleLine(buffered);
  async function handleLine(rawLine) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.trim().length === 0) return;
    let message2;
    try {
      message2 = JSON.parse(line);
    } catch {
      diagnose("Malformed JSON received on stdio");
      await writeResponse(protocolError(null, new BridgeProtocolError(-32700, "Parse error")));
      return;
    }
    const response = await server.handle(message2);
    if (response !== void 0) await writeResponse(response);
  }
  async function writeResponse(response) {
    if (!output.write(`${JSON.stringify(response)}
`)) await once(output, "drain");
  }
}

// src/setup/defaults.ts
import { readFile as readFile20 } from "node:fs/promises";
import { homedir as homedir4 } from "node:os";
import { join as join37 } from "node:path";

// src/hub/config/constants.ts
var HUB_CLIENT_STATE_VERSION = 1;
var DEFAULT_HUB_SERVICE_NAME = "svc:skillloom";
var HUB_STATE_DIR = "hub";

// src/hub/config/errors.ts
var HubStateValidationError = class extends Error {
  constructor(message2) {
    super(message2);
  }
};
var HubPendingAcknowledgementError = class extends Error {
  constructor(message2) {
    super(message2);
  }
};

// src/hub/config/layout.ts
import { join as join27 } from "node:path";
function hubClientLayout(projectRoot) {
  const root4 = join27(projectRoot, STORE_DIR, HUB_STATE_DIR);
  return {
    root: root4,
    trust: join27(root4, "trust.json"),
    endpoint: join27(root4, "endpoint.json"),
    sync: join27(root4, "sync.json"),
    pending: join27(root4, "pending")
  };
}

// src/hub/config/state.ts
import { readFile as readFile14 } from "node:fs/promises";

// src/hub/config/permissions.ts
import { chmod as chmod2, mkdir as mkdir16 } from "node:fs/promises";
async function ensurePrivateDirectory(path) {
  await mkdir16(path, { recursive: true, mode: 448 });
  await chmod2(path, 448);
}

// src/hub/config/schema.ts
import { createHash as createHash7 } from "node:crypto";

// src/hub/protocol/version.ts
var HUB_PROTOCOL_VERSION = "1.0";
function isCanonicalEventSequence(value) {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}

// src/hub/config/schema.ts
function createDefaultHubSyncState() {
  return { version: HUB_CLIENT_STATE_VERSION, lastEventSequence: "0" };
}
function parseHubTrust(value) {
  const record = exactRecord(value, ["version", "hubInstanceId", "signingKeyFingerprint", "trustedAt"], "Hub trust");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isNonemptyString(record.hubInstanceId) || typeof record.signingKeyFingerprint !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/.test(record.signingKeyFingerprint) || !isTimestamp(record.trustedAt)) {
    throw new HubStateValidationError("Invalid Hub trust state");
  }
  return {
    version: 1,
    hubInstanceId: record.hubInstanceId,
    signingKeyFingerprint: record.signingKeyFingerprint,
    trustedAt: record.trustedAt
  };
}
function parseHubEndpoint(value) {
  const record = exactRecord(value, ["version", "source", "serviceName", "url", "verifiedAt"], "Hub endpoint");
  if (record.version !== HUB_CLIENT_STATE_VERSION || record.source !== "development" && record.source !== "service" && record.source !== "host" || record.serviceName !== DEFAULT_HUB_SERVICE_NAME || !isTimestamp(record.verifiedAt)) {
    throw new HubStateValidationError("Invalid Hub endpoint cache");
  }
  const url = validateHubUrl(record.url, record.source === "development");
  return { version: 1, source: record.source, serviceName: record.serviceName, url, verifiedAt: record.verifiedAt };
}
function parseHubSyncState(value) {
  const record = exactRecord(value, ["version", "lastEventSequence"], "Hub sync");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isCanonicalEventSequence(record.lastEventSequence)) {
    throw new HubStateValidationError("Invalid Hub sync state");
  }
  return { version: 1, lastEventSequence: record.lastEventSequence };
}
function parsePendingHubMutation(value) {
  const record = exactRecord(value, ["version", "requestId", "method", "path", "body", "bodyHash", "createdAt"], "Pending Hub mutation");
  if (record.version !== HUB_CLIENT_STATE_VERSION || !isUuid(record.requestId) || record.method !== "POST" && record.method !== "PUT" && record.method !== "PATCH" && record.method !== "DELETE" || !isSafePath(record.path) || typeof record.body !== "string" || typeof record.bodyHash !== "string" || record.bodyHash !== bodyDigest(record.body) || !isTimestamp(record.createdAt)) {
    throw new HubStateValidationError("Invalid pending Hub mutation");
  }
  return {
    version: 1,
    requestId: record.requestId,
    method: record.method,
    path: record.path,
    body: record.body,
    bodyHash: record.bodyHash,
    createdAt: record.createdAt
  };
}
function parseHubMutationAcknowledgement(value) {
  if (!isRecord13(value) || !isUuid(value.requestId) || value.accepted !== true || !Object.hasOwn(value, "data")) {
    throw new HubStateValidationError("Invalid Hub mutation acknowledgement");
  }
  return { requestId: value.requestId, accepted: true, data: value.data };
}
function validateHubUrl(value, allowLoopbackHttp) {
  if (typeof value !== "string") throw new HubStateValidationError("Hub URL must be a string");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HubStateValidationError("Hub URL is invalid");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.protocol !== "https:" && !(allowLoopbackHttp && loopback && url.protocol === "http:")) {
    throw new HubStateValidationError("Hub URL must be credential-free HTTPS without path, query, or fragment");
  }
  return url.origin;
}
function exactRecord(value, keys, label) {
  if (!isRecord13(value) || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value))) {
    throw new HubStateValidationError(`${label} state has an invalid shape`);
  }
  return value;
}
function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function isNonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isSafePath(value) {
  return typeof value === "string" && value.startsWith("/v1/") && !value.includes("?") && !value.includes("#");
}
function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function bodyDigest(body) {
  return `sha256:${createHash7("sha256").update(body).digest("base64url")}`;
}
function isRecord13(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/config/state.ts
async function readHubTrust(root4) {
  return await readOptionalJson(hubClientLayout(root4).trust, parseHubTrust);
}
async function writeHubTrust(root4, trust) {
  await writeState(root4, hubClientLayout(root4).trust, parseHubTrust(trust));
}
async function readHubEndpoint(root4) {
  return await readOptionalJson(hubClientLayout(root4).endpoint, parseHubEndpoint);
}
async function writeHubEndpoint(root4, endpoint) {
  await writeState(root4, hubClientLayout(root4).endpoint, parseHubEndpoint(endpoint));
}
async function readHubSyncState(root4) {
  return await readOptionalJson(hubClientLayout(root4).sync, parseHubSyncState) ?? createDefaultHubSyncState();
}
async function writeHubSyncState(root4, sync) {
  await writeState(root4, hubClientLayout(root4).sync, parseHubSyncState(sync));
}
async function writeState(root4, path, value) {
  await ensurePrivateDirectory(hubClientLayout(root4).root);
  await atomicWriteJson(path, value, { mode: 384 });
}
async function readOptionalJson(path, parse2) {
  try {
    return parse2(JSON.parse(await readFile14(path, "utf8")));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
function isMissing(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/hub/config/pending.ts
import { createHash as createHash8 } from "node:crypto";
import { readdir as readdir9, readFile as readFile15, rm as rm11 } from "node:fs/promises";
import { join as join28 } from "node:path";
async function enqueuePendingMutation(root4, input) {
  const pending = parsePendingHubMutation({
    ...input,
    version: HUB_CLIENT_STATE_VERSION,
    bodyHash: digest3(input.body)
  });
  const layout = hubClientLayout(root4);
  const directory = layout.pending;
  await ensurePrivateDirectory(layout.root);
  await ensurePrivateDirectory(directory);
  const path = pendingPath(directory, pending.requestId);
  const existing = await readOptionalPending(path);
  if (existing) {
    if (existing.bodyHash !== pending.bodyHash || existing.method !== pending.method || existing.path !== pending.path) {
      throw new HubStateValidationError(`Pending request ${pending.requestId} cannot be reused for a different mutation`);
    }
    return existing;
  }
  await atomicWriteJson(path, pending, { mode: 384 });
  return pending;
}
async function readHubPendingMutations(root4) {
  const directory = hubClientLayout(root4).pending;
  let names;
  try {
    names = (await readdir9(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (isMissing2(error)) return [];
    throw error;
  }
  return await Promise.all(names.map(async (name) => parsePendingHubMutation(JSON.parse(await readFile15(join28(directory, name), "utf8")))));
}
async function acknowledgePendingMutation(root4, requestId2, acknowledgement) {
  const parsedAcknowledgement = parseHubMutationAcknowledgement(acknowledgement);
  if (parsedAcknowledgement.requestId !== requestId2) {
    throw new HubPendingAcknowledgementError("Hub acknowledgement does not match the pending request");
  }
  const directory = hubClientLayout(root4).pending;
  const pending = await readOptionalPending(pendingPath(directory, requestId2));
  if (!pending) throw new HubPendingAcknowledgementError(`Pending request ${requestId2} does not exist`);
  await rm11(pendingPath(directory, requestId2));
  await syncDirectory(directory);
}
function pendingPath(directory, requestId2) {
  return join28(directory, `${createHash8("sha256").update(requestId2).digest("hex")}.json`);
}
function digest3(body) {
  return `sha256:${createHash8("sha256").update(body).digest("base64url")}`;
}
async function readOptionalPending(path) {
  try {
    return parsePendingHubMutation(JSON.parse(await readFile15(path, "utf8")));
  } catch (error) {
    if (isMissing2(error)) return null;
    throw error;
  }
}
function isMissing2(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/hub/client/errors.ts
var HubClientError = class extends Error {
  constructor(message2, code, options) {
    super(message2, options);
    this.code = code;
  }
  code;
};
var HubDiscoveryConfigurationError = class extends HubClientError {
  constructor(message2, options) {
    super(message2, "HUB_DISCOVERY_CONFIGURATION_ERROR", options);
  }
};
var HubTrustNotEstablishedError = class extends HubClientError {
  constructor() {
    super("Hub trust has not been established by explicit setup", "HUB_TRUST_NOT_ESTABLISHED");
  }
};
var HubTrustChangedError = class extends HubClientError {
  constructor(field) {
    super(`Hub ${field} changed; explicit re-trust is required`, "HUB_TRUST_CHANGED");
  }
};
var HubUnavailableError = class extends HubClientError {
  constructor(message2 = "Skillloom Hub is unavailable", options) {
    super(message2, "HUB_UNAVAILABLE", options);
  }
};
var HubTimeoutError = class extends HubClientError {
  constructor(message2 = "Skillloom Hub request timed out", options) {
    super(message2, "HUB_TIMEOUT", options);
  }
};
var HubHttpError = class extends HubClientError {
  constructor(status, message2 = `Skillloom Hub returned HTTP ${status}`) {
    super(message2, "HUB_HTTP_ERROR");
    this.status = status;
  }
  status;
};
var HubResponseValidationError = class extends HubClientError {
  constructor(message2, options) {
    super(message2, "HUB_RESPONSE_VALIDATION_ERROR", options);
  }
};
var HubStableReleaseNotFoundError = class extends HubClientError {
  constructor(releaseId) {
    super(`Stable release was not found: ${releaseId}`, "HUB_STABLE_RELEASE_NOT_FOUND");
  }
};

// src/hub/client/brain-response.ts
function parseBrainDataEnvelope(value, parse2) {
  if (!isRecord10(value) || !Object.hasOwn(value, "data")) throw invalid("Hub response is missing data");
  return parse2(value.data);
}
function parseBrainSearchResults(value) {
  if (!Array.isArray(value)) throw invalid("Brain search data must be an array");
  return value.map((item) => {
    const metadata2 = parseArtifactMetadata(item);
    if (!isRecord10(item) || typeof item.excerpt !== "string") throw invalid("Brain search result is malformed");
    return { ...metadata2, excerpt: item.excerpt };
  });
}
function parseBrainRetrievalResult(value) {
  if (!isRecord10(value) || value.tier !== "quick" && value.tier !== "standard" && value.tier !== "deep" || typeof value.query !== "string" || !isRecord10(value.filters) || !Array.isArray(value.results) || !Array.isArray(value.hotContext) || typeof value.recoveredIndex !== "boolean" || value.health !== void 0 && !isRecord10(value.health)) {
    throw invalid("Brain retrieval result is malformed");
  }
  return {
    tier: value.tier,
    query: value.query,
    filters: value.filters,
    results: value.results.map(parseBrainRetrievalItem),
    hotContext: value.hotContext.map(parseHotContextItem),
    recoveredIndex: value.recoveredIndex,
    ...value.health === void 0 ? {} : { health: parseBrainHealthReport(value.health) }
  };
}
function parseBrainHealthReport(value) {
  if (!isRecord10(value) || value.status !== "ok" && value.status !== "degraded" || typeof value.checkedAt !== "string" || typeof value.canonicalArtifacts !== "number" || typeof value.indexedArtifacts !== "number" || typeof value.auditEvents !== "number" || typeof value.indexedAuditEvents !== "number" || typeof value.indexedLinks !== "number" || typeof value.unresolvedGaps !== "number" || typeof value.contradictions !== "number" || typeof value.recoveredIndex !== "boolean" || !Array.isArray(value.issues) || !Array.isArray(value.recommendations) || !value.recommendations.every((item) => typeof item === "string")) {
    throw invalid("Brain health report is malformed");
  }
  return {
    status: value.status,
    checkedAt: value.checkedAt,
    canonicalArtifacts: value.canonicalArtifacts,
    indexedArtifacts: value.indexedArtifacts,
    auditEvents: value.auditEvents,
    indexedAuditEvents: value.indexedAuditEvents,
    indexedLinks: value.indexedLinks,
    unresolvedGaps: value.unresolvedGaps,
    contradictions: value.contradictions,
    recoveredIndex: value.recoveredIndex,
    issues: value.issues.map(parseHealthIssue),
    recommendations: value.recommendations
  };
}
function parseBrainArtifact2(value) {
  const metadata2 = parseArtifactMetadata(value);
  if (!isRecord10(value) || typeof value.content !== "string") throw invalid("Brain artifact content is malformed");
  return { ...metadata2, content: value.content };
}
function parseBrainArtifactMutation(value) {
  if (!isRecord10(value) || value.kind !== "artifact" || typeof value.eventSequence !== "string") {
    throw invalid("Brain artifact mutation result is malformed");
  }
  return { kind: "artifact", artifact: parseArtifactMetadata(value.artifact), eventSequence: value.eventSequence };
}
function parseBrainLinkMutation(value) {
  if (!isRecord10(value) || value.kind !== "link" || typeof value.eventSequence !== "string") {
    throw invalid("Brain link mutation result is malformed");
  }
  return { kind: "link", link: parseLink2(value.link), eventSequence: value.eventSequence };
}
function parseArtifactMetadata(value) {
  if (!isRecord10(value) || typeof value.id !== "string" || !isBrainArtifactType2(value.type) || typeof value.path !== "string" || typeof value.revision !== "string" || typeof value.contentHash !== "string" || typeof value.title !== "string" || !isJsonRecord2(value.frontmatter) || !isJsonRecord2(value.provenance) || !isBrainSensitivity2(value.sensitivity) || value.layer !== void 0 && !isBrainArtifactLayer2(value.layer) || value.source !== void 0 && !isJsonRecord2(value.source) || value.details !== void 0 && !isJsonRecord2(value.details) || typeof value.createdAt !== "string" || typeof value.createdBy !== "string" || typeof value.updatedAt !== "string" || typeof value.updatedBy !== "string") {
    throw invalid("Brain artifact metadata is malformed");
  }
  return {
    id: value.id,
    type: value.type,
    layer: value.layer ?? defaultBrainLayer(value.type),
    path: value.path,
    revision: value.revision,
    contentHash: value.contentHash,
    title: value.title,
    frontmatter: value.frontmatter,
    provenance: value.provenance,
    ...value.source === void 0 ? {} : { source: parseBrainSourceMetadata(value.source) },
    details: parseBrainArtifactDetails(value.details ?? {}),
    sensitivity: value.sensitivity,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy
  };
}
function parseLink2(value) {
  if (!isRecord10(value) || typeof value.id !== "string" || typeof value.sourceArtifactId !== "string" || typeof value.targetArtifactId !== "string" || typeof value.relationship !== "string" || typeof value.createdAt !== "string" || typeof value.createdBy !== "string") {
    throw invalid("Brain link is malformed");
  }
  return {
    id: value.id,
    sourceArtifactId: value.sourceArtifactId,
    targetArtifactId: value.targetArtifactId,
    relationship: value.relationship,
    createdAt: value.createdAt,
    createdBy: value.createdBy
  };
}
function parseBrainRetrievalItem(value) {
  const metadata2 = parseArtifactMetadata(value);
  if (!isRecord10(value) || typeof value.excerpt !== "string" || typeof value.score !== "number" || typeof value.graphDistance !== "number" || !Array.isArray(value.reasons) || !isRecord10(value.decorations)) {
    throw invalid("Brain retrieval item is malformed");
  }
  if (!Array.isArray(value.decorations.contradictions) || !Array.isArray(value.decorations.gaps)) {
    throw invalid("Brain retrieval decorations are malformed");
  }
  return {
    ...metadata2,
    excerpt: value.excerpt,
    score: value.score,
    graphDistance: value.graphDistance,
    reasons: value.reasons.map(parseRetrievalReason),
    decorations: {
      contradictions: value.decorations.contradictions.map(parseRetrievalDecoration),
      gaps: value.decorations.gaps.map(parseRetrievalDecoration)
    }
  };
}
function parseRetrievalReason(value) {
  if (!isRecord10(value) || value.kind !== "title" && value.kind !== "content" && value.kind !== "metadata" && value.kind !== "graph" && value.kind !== "freshness" || typeof value.weight !== "number" || typeof value.detail !== "string") {
    throw invalid("Brain retrieval reason is malformed");
  }
  return { kind: value.kind, weight: value.weight, detail: value.detail };
}
function parseRetrievalDecoration(value) {
  if (!isRecord10(value) || value.relationship !== "contradicts" && value.relationship !== "fills-gap") {
    throw invalid("Brain retrieval decoration is malformed");
  }
  return { artifact: parseArtifactMetadata(value.artifact), relationship: value.relationship, link: parseLink2(value.link) };
}
function parseHotContextItem(value) {
  if (!isRecord10(value) || typeof value.artifactId !== "string" || !isBrainArtifactType2(value.type) || typeof value.title !== "string" || typeof value.score !== "number" || typeof value.excerpt !== "string" || typeof value.content !== "string") {
    throw invalid("Brain hot context item is malformed");
  }
  return { artifactId: value.artifactId, type: value.type, title: value.title, score: value.score, excerpt: value.excerpt, content: value.content };
}
function parseHealthIssue(value) {
  if (!isRecord10(value) || !isHealthIssueCode(value.code) || value.severity !== "warning" && value.severity !== "error" || typeof value.detail !== "string" || value.artifactId !== void 0 && typeof value.artifactId !== "string" || value.linkId !== void 0 && typeof value.linkId !== "string" || value.eventSequence !== void 0 && typeof value.eventSequence !== "string") {
    throw invalid("Brain health issue is malformed");
  }
  return {
    code: value.code,
    severity: value.severity,
    detail: value.detail,
    ...value.artifactId === void 0 ? {} : { artifactId: value.artifactId },
    ...value.linkId === void 0 ? {} : { linkId: value.linkId },
    ...value.eventSequence === void 0 ? {} : { eventSequence: value.eventSequence }
  };
}
function isHealthIssueCode(value) {
  return value === "canonical-artifact-missing-from-index" || value === "stale-index-artifact" || value === "audit-event-missing-from-index" || value === "stale-index-audit-event" || value === "audit-link-missing-from-index" || value === "stale-index-link" || value === "idempotency-missing-from-index" || value === "orphan-audit-link-endpoint" || value === "orphan-index-link-endpoint";
}
function invalid(message2) {
  return new HubResponseValidationError(message2);
}

// src/hub/client/durable-mutation.ts
async function executeDurableHubMutation(options) {
  const pending = await enqueuePendingMutation(options.root, options.input);
  const result = await options.client.request({
    mutation: pending,
    replayable: options.replayable,
    parse: parseHubMutationAcknowledgement
  });
  const value = options.parse(result.data);
  await acknowledgePendingMutation(options.root, pending.requestId, result);
  return value;
}

// src/hub/client/brain-api.ts
function createBrainApi(root4, client) {
  return {
    search: async (input) => await query(client, "/v1/brain/search", input, parseBrainSearchResults),
    retrieve: async (input) => await query(client, "/v1/brain/retrieve", input, parseBrainRetrievalResult),
    health: async () => await client.request({
      method: "GET",
      path: "/v1/brain/health",
      parse: (value) => parseBrainDataEnvelope(value, parseBrainHealthReport)
    }),
    read: async (artifactId2) => await client.request({
      method: "GET",
      path: `/v1/brain/${encodeURIComponent(artifactId2)}`,
      parse: (value) => parseBrainDataEnvelope(value, parseBrainArtifact2)
    }),
    capture: async (requestId2, input) => await mutate(root4, client, requestId2, "POST", "/v1/brain/captures", input, parseBrainArtifactMutation),
    update: async (requestId2, artifactId2, input) => await mutate(
      root4,
      client,
      requestId2,
      "PUT",
      `/v1/brain/${encodeURIComponent(artifactId2)}`,
      input,
      parseBrainArtifactMutation
    ),
    link: async (requestId2, sourceArtifactId, input) => await mutate(
      root4,
      client,
      requestId2,
      "POST",
      `/v1/brain/${encodeURIComponent(sourceArtifactId)}/links`,
      input,
      parseBrainLinkMutation
    )
  };
}
async function drainPendingHubMutations(root4, client) {
  const pending = (await readHubPendingMutations(root4)).sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.requestId.localeCompare(right.requestId)
  );
  let acknowledged = 0;
  for (const mutation of pending) {
    const response = await client.request({ mutation, replayable: true, parse: parseHubMutationAcknowledgement });
    await acknowledgePendingMutation(root4, mutation.requestId, response);
    acknowledged += 1;
  }
  return acknowledged;
}
async function query(client, path, body, parse2) {
  return await client.request({
    method: "POST",
    path,
    body: JSON.stringify(body),
    parse: (value) => parseBrainDataEnvelope(value, parse2)
  });
}
async function mutate(root4, client, requestId2, method, path, body, parse2) {
  return await executeDurableHubMutation({
    root: root4,
    client,
    input: { requestId: requestId2, method, path, body: JSON.stringify(body), createdAt: (/* @__PURE__ */ new Date()).toISOString() },
    replayable: true,
    parse: parse2
  });
}

// src/hub/client/discovery.ts
async function discoverHub(options) {
  const candidates = buildCandidates(options);
  const attempted = [];
  for (const candidate2 of candidates) {
    attempted.push(candidate2.url);
    if (await options.probe(candidate2)) {
      return { mode: "connected", endpoint: candidate2.endpoint, attempted };
    }
  }
  return { mode: "local-only", attempted };
}
function buildCandidates(options) {
  const candidates = [];
  const verifiedAt = (options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
  if (options.developmentUrl !== void 0) {
    let url;
    try {
      url = validateHubUrl(options.developmentUrl, true);
    } catch (error) {
      throw new HubDiscoveryConfigurationError("SKILLLOOM_HUB_URL is unsafe or invalid", { cause: error });
    }
    candidates.push(candidate("development", url, verifiedAt));
  }
  if (options.cachedEndpoint) {
    const endpoint = parseHubEndpoint(options.cachedEndpoint);
    candidates.push({ source: "cached", endpoint, url: endpoint.url });
  }
  if (options.magicDnsSuffix !== void 0) {
    const suffix = normalizeMagicDnsSuffix(options.magicDnsSuffix);
    candidates.push(candidate("service", `https://skillloom.${suffix}`, verifiedAt));
    candidates.push(candidate("host", `https://skillloom-hub.${suffix}`, verifiedAt));
  }
  return deduplicate(candidates);
}
function candidate(source, url, verifiedAt) {
  const endpoint = { version: 1, source, serviceName: DEFAULT_HUB_SERVICE_NAME, url, verifiedAt };
  return { source, endpoint, url };
}
function normalizeMagicDnsSuffix(value) {
  const suffix = value.trim().replace(/\.$/, "").toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(suffix)) {
    throw new HubDiscoveryConfigurationError("Tailscale MagicDNS suffix is invalid");
  }
  return suffix;
}
function deduplicate(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

// src/hub/protocol/errors.ts
var HubProtocolError = class extends Error {
  constructor(message2, code) {
    super(message2);
    this.code = code;
  }
  code;
};
var HubProtocolValidationError = class extends HubProtocolError {
  constructor(message2) {
    super(message2, "HUB_PROTOCOL_VALIDATION_ERROR");
  }
};
var IncompatibleHubProtocolError = class extends HubProtocolError {
  constructor(clientVersion, hubVersion) {
    super(`Hub protocol ${hubVersion} is incompatible with client protocol ${clientVersion}`, "HUB_PROTOCOL_INCOMPATIBLE");
  }
};
var HubClientVersionUnsupportedError = class extends HubProtocolError {
  constructor(clientVersion, minimumVersion) {
    super(`Hub requires client ${minimumVersion} or newer; current client is ${clientVersion}`, "HUB_CLIENT_VERSION_UNSUPPORTED");
  }
};

// src/hub/protocol/signing-key.ts
import { createHash as createHash9, createPublicKey } from "node:crypto";
function canonicalSigningKeyFingerprint(publicKey) {
  try {
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error("not Ed25519");
    }
    const spki = key.export({ type: "spki", format: "der" });
    return `sha256:${createHash9("sha256").update(spki).digest("base64url")}`;
  } catch {
    throw new HubProtocolValidationError("releaseSigningPublicKey must be a valid Ed25519 SPKI public key");
  }
}

// src/hub/protocol/schema.ts
function parseNegotiationResponse(value, compatibility) {
  if (!isRecord14(value)) throw new HubProtocolValidationError("Negotiation response must be an object");
  const protocolVersion = requiredVersion(value.protocolVersion, "protocolVersion");
  const minimumClientVersion = requiredVersion(value.minimumClientVersion, "minimumClientVersion");
  if (major(protocolVersion) !== major(compatibility.protocolVersion)) {
    throw new IncompatibleHubProtocolError(compatibility.protocolVersion, protocolVersion);
  }
  if (compareVersions(compatibility.clientVersion, minimumClientVersion) < 0) {
    throw new HubClientVersionUnsupportedError(compatibility.clientVersion, minimumClientVersion);
  }
  const releaseSigningPublicKey = requiredString2(value.releaseSigningPublicKey, "releaseSigningPublicKey");
  canonicalSigningKeyFingerprint(releaseSigningPublicKey);
  if (!isCanonicalEventSequence(value.latestEventSequence)) {
    throw new HubProtocolValidationError("latestEventSequence must be a canonical nonnegative decimal string");
  }
  return {
    protocolVersion,
    minimumClientVersion,
    hubInstanceId: requiredString2(value.hubInstanceId, "hubInstanceId"),
    tailnetIdentity: parseTailnetIdentity(value.tailnetIdentity),
    grantedCapabilities: stringArray(value.grantedCapabilities, "grantedCapabilities"),
    releaseSigningPublicKey,
    latestEventSequence: value.latestEventSequence
  };
}
function parseTailnetIdentity(value) {
  if (!isRecord14(value)) throw new HubProtocolValidationError("tailnetIdentity must be an object");
  const kind = value.kind;
  if (kind !== "user" && kind !== "node") throw new HubProtocolValidationError("tailnetIdentity.kind is invalid");
  const actorId = requiredString2(value.actorId, "tailnetIdentity.actorId");
  if (!actorId.startsWith(`${kind}:`)) throw new HubProtocolValidationError("tailnetIdentity.actorId does not match its kind");
  const displayName = optionalString4(value.displayName, "tailnetIdentity.displayName");
  const nodeId = optionalString4(value.nodeId, "tailnetIdentity.nodeId");
  const nodeName = optionalString4(value.nodeName, "tailnetIdentity.nodeName");
  return {
    actorId,
    kind,
    ...displayName === void 0 ? {} : { displayName },
    ...nodeId === void 0 ? {} : { nodeId },
    ...nodeName === void 0 ? {} : { nodeName }
  };
}
function requiredVersion(value, field) {
  const version = requiredString2(value, field);
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new HubProtocolValidationError(`${field} must be a numeric version`);
  return version;
}
function compareVersions(left, right) {
  const a = numericVersion(left);
  const b = numericVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}
function major(version) {
  return numericVersion(version)[0] ?? 0;
}
function numericVersion(version) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new HubProtocolValidationError(`Invalid version ${version}`);
  return version.split(".").map(Number);
}
function requiredString2(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) throw new HubProtocolValidationError(`${field} must be a non-empty string`);
  return value.trim();
}
function optionalString4(value, field) {
  return value === void 0 ? void 0 : requiredString2(value, field);
}
function stringArray(value, field) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new HubProtocolValidationError(`${field} must be a string array`);
  }
  return [...new Set(value.map((item) => item.trim()))].sort();
}
function isRecord14(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/client/negotiation.ts
async function negotiateHub(client, clientVersion) {
  return await client.request({
    method: "GET",
    path: "/v1/hello",
    parse: (value) => parseNegotiationResponse(value, { protocolVersion: HUB_PROTOCOL_VERSION, clientVersion })
  });
}

// src/hub/client/release-materialize.ts
import { createHash as createHash11, randomUUID as randomUUID8 } from "node:crypto";
import { chmod as chmod4, mkdir as mkdir18, mkdtemp as mkdtemp2, rm as rm13, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname16, join as join30 } from "node:path";

// src/hub/registry/errors.ts
var RegistryValidationError = class extends Error {
  constructor(message2) {
    super(message2);
    this.name = "RegistryValidationError";
  }
};
var RegistryCanonicalJsonError = class extends RegistryValidationError {
  constructor(message2) {
    super(message2);
    this.name = "RegistryCanonicalJsonError";
  }
};
var RegistryPackageError = class extends RegistryValidationError {
  constructor(message2) {
    super(message2);
    this.name = "RegistryPackageError";
  }
};
var RegistrySignatureVerificationError = class extends RegistryValidationError {
  constructor(message2) {
    super(message2);
    this.name = "RegistrySignatureVerificationError";
  }
};
var RegistryHubMismatchError = class extends RegistrySignatureVerificationError {
  constructor(expected, received) {
    super(`Hub instance mismatch: expected ${expected}, received ${received}`);
    this.name = "RegistryHubMismatchError";
  }
};
var RegistrySequenceRollbackError = class extends RegistrySignatureVerificationError {
  constructor(afterSequence, received) {
    super(`Registry sequence rollback: expected a sequence after ${afterSequence}, received ${received}`);
    this.name = "RegistrySequenceRollbackError";
  }
};

// src/hub/registry/canonical-json.ts
function canonicalizeJson(value) {
  return encode(value, /* @__PURE__ */ new Set());
}
function encode(value, ancestors) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    validateUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RegistryCanonicalJsonError("JSON numbers must be finite");
    if (Object.is(value, -0)) throw new RegistryCanonicalJsonError("JSON does not support negative zero canonically");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new RegistryCanonicalJsonError(`Unsupported JSON value type: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new RegistryCanonicalJsonError("Unsupported circular JSON value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return encodeArray(value, ancestors);
    return encodeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}
function encodeArray(value, ancestors) {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) throw new RegistryCanonicalJsonError("Unsupported sparse JSON array");
  }
  return `[${value.map((item) => encode(item, ancestors)).join(",")}]`;
}
function encodeObject(value, ancestors) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RegistryCanonicalJsonError("JSON objects must be plain objects");
  }
  const keys = Object.keys(value).sort();
  if (Reflect.ownKeys(value).length !== keys.length) {
    throw new RegistryCanonicalJsonError("Unsupported non-enumerable or symbol JSON property");
  }
  if (keys.some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor === void 0 || descriptor.get !== void 0 || descriptor.set !== void 0;
  })) {
    throw new RegistryCanonicalJsonError("Unsupported accessor JSON property");
  }
  return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(Reflect.get(value, key), ancestors)}`).join(",")}}`;
}
function validateUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) throw new RegistryCanonicalJsonError("JSON strings must contain valid Unicode");
      index += 1;
    } else if (code >= 56320 && code <= 57343) {
      throw new RegistryCanonicalJsonError("JSON strings must contain valid Unicode");
    }
  }
}

// src/hub/registry/package-blob.ts
import { chmod as chmod3, mkdir as mkdir17, mkdtemp, rm as rm12, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname as dirname15, join as join29, posix as posix2 } from "node:path";
function parsePackageBlob(value) {
  const record = strictRecord2(value, ["schemaVersion", "files"], "package blob");
  if (record.schemaVersion !== "skillloom-package-blob-v1") throw new RegistryPackageError("Unsupported package blob schemaVersion");
  if (!Array.isArray(record.files) || record.files.length === 0) throw new RegistryPackageError("Package blob files must be a non-empty array");
  if (record.files.length > 256) throw new RegistryPackageError("Package blob exceeds file-count size limit");
  let totalBytes = 0;
  const paths = /* @__PURE__ */ new Set();
  const files2 = record.files.map((item, index) => {
    const parsed = parseFile(item, index);
    if (paths.has(parsed.relativePath)) throw new RegistryPackageError(`Duplicate package path: ${parsed.relativePath}`);
    paths.add(parsed.relativePath);
    const size = decodeBase64(parsed.contentBase64, parsed.relativePath).byteLength;
    if (size > MAX_FILE_BYTES) throw new RegistryPackageError(`File exceeds size limit: ${parsed.relativePath}`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new RegistryPackageError("Package blob exceeds total size limit");
    return Object.freeze(parsed);
  }).sort((left, right) => comparePackagePath(left.relativePath, right.relativePath));
  if (!paths.has("SKILL.md")) throw new RegistryPackageError("Package blob must contain SKILL.md");
  return Object.freeze({ schemaVersion: "skillloom-package-blob-v1", files: Object.freeze(files2) });
}
async function hashPackageBlob(value) {
  const blob = parsePackageBlob(value);
  const root4 = await mkdtemp(join29(tmpdir(), "skillloom-registry-package-"));
  try {
    const files2 = [];
    for (const file2 of blob.files) {
      const absolutePath = join29(root4, ...file2.relativePath.split("/"));
      const content = decodeBase64(file2.contentBase64, file2.relativePath);
      await mkdir17(dirname15(absolutePath), { recursive: true });
      await writeFile2(absolutePath, content, { flag: "wx" });
      await chmod3(absolutePath, file2.mode);
      files2.push({ relativePath: file2.relativePath, absolutePath, size: content.byteLength, mode: file2.mode });
    }
    return await hashPackage(files2);
  } finally {
    await rm12(root4, { recursive: true, force: true });
  }
}
function parseFile(value, index) {
  const record = strictRecord2(value, ["relativePath", "mode", "contentBase64"], `files[${index}]`);
  const relativePath = packagePath(record.relativePath);
  const mode = packageMode(record.mode, relativePath);
  if (typeof record.contentBase64 !== "string" || !isCanonicalBase64(record.contentBase64)) {
    throw new RegistryPackageError(`Invalid base64 content for ${relativePath}`);
  }
  decodeBase64(record.contentBase64, relativePath);
  return { relativePath, mode, contentBase64: record.contentBase64 };
}
function packagePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
    throw new RegistryPackageError("Package path must be a relative POSIX path without NUL bytes");
  }
  if (posix2.isAbsolute(value) || /^[A-Za-z]:/.test(value) || posix2.normalize(value) !== value) {
    throw new RegistryPackageError(`Unsafe package path: ${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new RegistryPackageError(`Unsafe package path: ${value}`);
  }
  return value;
}
function packageMode(value, relativePath) {
  if (value !== 420 && value !== 493) throw new RegistryPackageError(`Invalid normalized mode for ${relativePath}`);
  return value;
}
function isCanonicalBase64(value) {
  return value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) && Buffer.from(value, "base64").toString("base64") === value;
}
function decodeBase64(value, relativePath) {
  const content = Buffer.from(value, "base64");
  if (content.includes(0)) throw new RegistryPackageError(`Refusing binary file: ${relativePath}`);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new RegistryPackageError(`File must contain valid UTF-8 text: ${relativePath}`);
  }
  return content;
}
function strictRecord2(value, keys, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RegistryPackageError(`${field} must be an object`);
  }
  const record = value;
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string")) throw new RegistryPackageError(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys) {
    if (!expected.has(key)) throw new RegistryPackageError(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === void 0 || !descriptor.enumerable || descriptor.get !== void 0 || descriptor.set !== void 0) {
      throw new RegistryPackageError(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) throw new RegistryPackageError(`${field}.${key} is required`);
  }
  return record;
}

// src/hub/registry/release-signature.ts
import {
  createPrivateKey,
  createPublicKey as createPublicKey2,
  generateKeyPairSync,
  KeyObject,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";

// src/hub/registry/schema.ts
function parseRegistryCandidate(value) {
  const record = strictRecord3(value, [
    "schemaVersion",
    "hubInstanceId",
    "sequence",
    "candidateId",
    "name",
    "packageHash",
    "baseReleaseHash",
    "divergence",
    "supersession",
    "provenance",
    "capabilities",
    "validationDigest",
    "createdAt",
    "createdBy",
    "governedWorkflowProof"
  ], "candidate");
  literal2(record.schemaVersion, "skillloom-registry-candidate-v1", "schemaVersion");
  const baseReleaseHash = nullablePackageHash2(record.baseReleaseHash, "baseReleaseHash");
  const divergence = parseDivergence(record.divergence);
  if (divergence.state === "divergent" && baseReleaseHash === null) {
    throw new RegistryValidationError("A divergent candidate requires baseReleaseHash");
  }
  if (divergence.state === "divergent" && divergence.currentReleaseHash === baseReleaseHash) {
    throw new RegistryValidationError("A divergent candidate currentReleaseHash must differ from baseReleaseHash");
  }
  return deepFreeze({
    schemaVersion: "skillloom-registry-candidate-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: sequence3(record.sequence, "sequence"),
    candidateId: identifier(record.candidateId, "candidateId"),
    name: identifier(record.name, "name"),
    packageHash: packageHash3(record.packageHash, "packageHash"),
    baseReleaseHash,
    divergence,
    supersession: parseSupersession(record.supersession),
    provenance: parseProvenance(record.provenance),
    capabilities: parseCapabilities2(record.capabilities),
    validationDigest: digest4(record.validationDigest, "validationDigest"),
    ...record.governedWorkflowProof === void 0 ? {} : { governedWorkflowProof: parseWorkflowProofDecision(record.governedWorkflowProof, registryError, "governedWorkflowProof") },
    createdAt: timestamp2(record.createdAt, "createdAt"),
    createdBy: identifier(record.createdBy, "createdBy")
  });
}
function parseRegistryRelease(value) {
  const record = strictRecord3(value, [
    "schemaVersion",
    "hubInstanceId",
    "sequence",
    "releaseId",
    "name",
    "version",
    "channel",
    "packageHash",
    "sourceCandidateId",
    "provenance",
    "capabilities",
    "validationDigest",
    "supersedesReleaseHash",
    "createdAt",
    "createdBy"
  ], "release");
  literal2(record.schemaVersion, "skillloom-registry-release-v1", "schemaVersion");
  return deepFreeze({
    schemaVersion: "skillloom-registry-release-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: sequence3(record.sequence, "sequence"),
    releaseId: identifier(record.releaseId, "releaseId"),
    name: identifier(record.name, "name"),
    version: semanticVersion2(record.version),
    channel: identifier(record.channel, "channel"),
    packageHash: packageHash3(record.packageHash, "packageHash"),
    sourceCandidateId: identifier(record.sourceCandidateId, "sourceCandidateId"),
    provenance: parseProvenance(record.provenance),
    capabilities: parseCapabilities2(record.capabilities),
    validationDigest: digest4(record.validationDigest, "validationDigest"),
    supersedesReleaseHash: nullablePackageHash2(record.supersedesReleaseHash, "supersedesReleaseHash"),
    createdAt: timestamp2(record.createdAt, "createdAt"),
    createdBy: identifier(record.createdBy, "createdBy")
  });
}
function parseChannelManifest(value) {
  const record = strictRecord3(value, ["schemaVersion", "hubInstanceId", "sequence", "channel", "releases", "generatedAt"], "channel manifest");
  literal2(record.schemaVersion, "skillloom-channel-manifest-v1", "schemaVersion");
  const manifestSequence = sequence3(record.sequence, "sequence");
  if (!Array.isArray(record.releases)) throw new RegistryValidationError("releases must be an array");
  const releases = record.releases.map((item, index) => parseManifestRelease(item, index));
  unique(releases.map((item) => item.releaseId), "releaseId");
  unique(releases.map((item) => item.name), "release name");
  unique(releases.map((item) => item.releaseSequence), "release sequence");
  if (releases.some((item) => BigInt(item.releaseSequence) > BigInt(manifestSequence))) {
    throw new RegistryValidationError("Release sequence cannot exceed the manifest sequence");
  }
  return deepFreeze({
    schemaVersion: "skillloom-channel-manifest-v1",
    hubInstanceId: identifier(record.hubInstanceId, "hubInstanceId"),
    sequence: manifestSequence,
    channel: identifier(record.channel, "channel"),
    releases,
    generatedAt: timestamp2(record.generatedAt, "generatedAt")
  });
}
function isCanonicalRegistrySequence(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}
function parseManifestRelease(value, index) {
  const record = strictRecord3(value, ["releaseId", "releaseSequence", "name", "version", "packageHash"], `releases[${index}]`);
  return {
    releaseId: identifier(record.releaseId, `releases[${index}].releaseId`),
    releaseSequence: sequence3(record.releaseSequence, `releases[${index}].releaseSequence`),
    name: identifier(record.name, `releases[${index}].name`),
    version: semanticVersion2(record.version),
    packageHash: packageHash3(record.packageHash, `releases[${index}].packageHash`)
  };
}
function parseDivergence(value) {
  if (!isRecord15(value) || typeof value.state !== "string") throw new RegistryValidationError("divergence must be an object");
  if (value.state === "aligned") {
    strictRecord3(value, ["state"], "divergence");
    return { state: "aligned" };
  }
  if (value.state === "divergent") {
    const record = strictRecord3(value, ["state", "currentReleaseHash"], "divergence");
    return { state: "divergent", currentReleaseHash: packageHash3(record.currentReleaseHash, "divergence.currentReleaseHash") };
  }
  throw new RegistryValidationError("divergence.state is invalid");
}
function parseSupersession(value) {
  if (!isRecord15(value) || typeof value.state !== "string") throw new RegistryValidationError("supersession must be an object");
  if (value.state === "active") {
    strictRecord3(value, ["state"], "supersession");
    return { state: "active" };
  }
  if (value.state === "superseded") {
    const record = strictRecord3(value, ["state", "byCandidateId"], "supersession");
    return { state: "superseded", byCandidateId: identifier(record.byCandidateId, "supersession.byCandidateId") };
  }
  throw new RegistryValidationError("supersession.state is invalid");
}
function parseProvenance(value) {
  if (!Array.isArray(value)) throw new RegistryValidationError("provenance must be an array");
  const parsed = value.map((item, index) => {
    const record = strictRecord3(item, ["artifactId", "revision", "contentHash"], `provenance[${index}]`);
    return {
      artifactId: identifier(record.artifactId, `provenance[${index}].artifactId`),
      revision: sequence3(record.revision, `provenance[${index}].revision`),
      contentHash: digest4(record.contentHash, `provenance[${index}].contentHash`)
    };
  });
  unique(parsed.map((item) => item.artifactId), "provenance artifactId");
  return parsed;
}
function parseCapabilities2(value) {
  const allowed = /* @__PURE__ */ new Set(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && allowed.has(item))) {
    throw new RegistryValidationError("capabilities contains an invalid capability");
  }
  unique(value, "capability");
  return [...value];
}
function strictRecord3(value, keys, field) {
  if (!isRecord15(value)) throw new RegistryValidationError(`${field} must be an object`);
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) throw new RegistryValidationError(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys) {
    if (!expected.has(key)) throw new RegistryValidationError(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === void 0 || !descriptor.enumerable || descriptor.get !== void 0 || descriptor.set !== void 0) {
      throw new RegistryValidationError(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (key === "governedWorkflowProof") continue;
    if (!Object.hasOwn(value, key)) throw new RegistryValidationError(`${field}.${key} is required`);
  }
  return value;
}
function identifier(value, field) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.includes("\0")) {
    throw new RegistryValidationError(`${field} must be a canonical non-empty string`);
  }
  return value;
}
function sequence3(value, field) {
  if (!isCanonicalRegistrySequence(value)) throw new RegistryValidationError(`${field} must be a canonical nonnegative decimal sequence`);
  return value;
}
function packageHash3(value, field) {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) {
    throw new RegistryValidationError(`${field} must be a sha256-v2 package hash`);
  }
  return value;
}
function nullablePackageHash2(value, field) {
  return value === null ? null : packageHash3(value, field);
}
function digest4(value, field) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new RegistryValidationError(`${field} must be a SHA-256 digest`);
  }
  return value;
}
function semanticVersion2(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
    throw new RegistryValidationError("version must be a canonical semantic version");
  }
  return value;
}
function timestamp2(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new RegistryValidationError(`${field} must be a canonical ISO timestamp`);
  }
  return value;
}
function literal2(value, expected, field) {
  if (value !== expected) throw new RegistryValidationError(`${field} must equal ${expected}`);
}
function unique(values, field) {
  if (new Set(values).size !== values.length) throw new RegistryValidationError(`${field} contains a duplicate value`);
}
function registryError(message2) {
  return new RegistryValidationError(message2);
}
function isRecord15(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function deepFreeze(value) {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// src/hub/registry/release-signature.ts
function createEd25519RegistryVerifier(input) {
  const publicKeyObject = publicEd25519Key(input);
  const publicKey = publicKeyObject.export({ type: "spki", format: "pem" }).toString();
  const keyFingerprint = canonicalSigningKeyFingerprint(publicKey);
  return Object.freeze({
    publicKey,
    keyFingerprint,
    verifyCanonical(canonicalPayload, signature2) {
      if (!/^[A-Za-z0-9_-]+$/.test(signature2)) return false;
      try {
        return verifyBytes(null, Buffer.from(canonicalPayload, "utf8"), publicKeyObject, Buffer.from(signature2, "base64url"));
      } catch {
        return false;
      }
    }
  });
}
function verifyRegistryPayload(verifier, envelope, context) {
  if (envelope.signature.algorithm !== "Ed25519" || envelope.signature.keyFingerprint !== verifier.keyFingerprint) {
    throw new RegistrySignatureVerificationError("Registry signing key does not match the trusted Ed25519 key");
  }
  if (!verifier.verifyCanonical(canonicalizeJson(envelope.payload), envelope.signature.value)) {
    throw new RegistrySignatureVerificationError("Registry signature verification failed");
  }
  if (envelope.payload.hubInstanceId !== context.hubInstanceId) {
    throw new RegistryHubMismatchError(context.hubInstanceId, envelope.payload.hubInstanceId);
  }
  if (!isCanonicalRegistrySequence(envelope.payload.sequence)) {
    throw new RegistrySignatureVerificationError("Signed registry sequence must be a canonical nonnegative decimal sequence");
  }
  if (context.afterSequence !== void 0) {
    if (!/^(0|[1-9]\d*)$/.test(context.afterSequence)) {
      throw new RegistrySignatureVerificationError("afterSequence must be a canonical nonnegative decimal sequence");
    }
    if (BigInt(envelope.payload.sequence) <= BigInt(context.afterSequence)) {
      throw new RegistrySequenceRollbackError(context.afterSequence, envelope.payload.sequence);
    }
  }
  return envelope.payload;
}
function publicEd25519Key(input) {
  try {
    const key = input instanceof KeyObject ? input.type === "private" ? createPublicKey2(input) : input : createPublicKey2(input);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("not an Ed25519 public key");
    return key;
  } catch {
    throw new RegistrySignatureVerificationError("Registry public key must be a native Ed25519 key");
  }
}

// src/hub/registry/server-hash.ts
import { createHash as createHash10 } from "node:crypto";
function hashRegistryPayload(value) {
  return `sha256:${createHash10("sha256").update(canonicalizeJson(value)).digest("hex")}`;
}

// src/hub/registry/server-schema.ts
function parseCandidateRecord(value) {
  const record = exactRecord2(value, ["candidate", "validation"]);
  const candidate2 = parseSigned(record.candidate, parseRegistryCandidate);
  const validation = parseValidationReport(record.validation);
  if (candidate2.payload.packageHash !== validation.packageHash || candidate2.payload.validationDigest !== validation.validationDigest) {
    throw new RegistryValidationError("Candidate does not match its validation report");
  }
  return { candidate: candidate2, validation };
}
function parsePublishResult(value) {
  const record = exactRecord2(value, ["release", "manifest"]);
  const release = parseSigned(record.release, parseRegistryRelease);
  const manifest = parseSigned(record.manifest, parseChannelManifest);
  if (!manifest.payload.releases.some((item) => item.releaseId === release.payload.releaseId && item.packageHash === release.payload.packageHash)) {
    throw new RegistryValidationError("Published manifest does not contain its release");
  }
  return { release, manifest };
}
function parseSignedRelease(value) {
  return parseSigned(value, parseRegistryRelease);
}
function parseSignedManifest(value) {
  return parseSigned(value, parseChannelManifest);
}
function parseValidationReport(value) {
  const record = exactRecord2(value, ["schemaVersion", "packageHash", "metadata", "capabilities", "files", "findings", "validationDigest"]);
  literal3(record.schemaVersion, "skillloom-registry-validation-v1", "validation schemaVersion");
  const report = {
    schemaVersion: "skillloom-registry-validation-v1",
    packageHash: packageHash4(record.packageHash),
    metadata: metadata(record.metadata),
    capabilities: capabilityList(record.capabilities),
    files: list(record.files, file),
    findings: list(record.findings, finding),
    validationDigest: digest5(record.validationDigest, "validationDigest")
  };
  const { validationDigest, ...evidence } = report;
  if (hashRegistryPayload(evidence) !== validationDigest) throw new RegistryValidationError("Validation report digest mismatch");
  return report;
}
function parseSigned(value, parsePayload) {
  const record = exactRecord2(value, ["payload", "signature"]);
  return { payload: parsePayload(record.payload), signature: signature(record.signature) };
}
function signature(value) {
  const record = exactRecord2(value, ["algorithm", "keyFingerprint", "value"]);
  literal3(record.algorithm, "Ed25519", "signature algorithm");
  return {
    algorithm: "Ed25519",
    keyFingerprint: text3(record.keyFingerprint, "keyFingerprint"),
    value: text3(record.value, "signature value")
  };
}
function metadata(value) {
  const record = exactRecord2(value, ["name", "description"], ["capabilities"]);
  const parsedCapabilities = Object.hasOwn(record, "capabilities") ? capabilityList(record.capabilities) : [];
  return parsedCapabilities.length === 0 ? { name: text3(record.name, "metadata.name"), description: text3(record.description, "metadata.description") } : { name: text3(record.name, "metadata.name"), description: text3(record.description, "metadata.description"), capabilities: parsedCapabilities };
}
function capabilityList(value) {
  const allowed = /* @__PURE__ */ new Set(["filesystem-read", "filesystem-write", "network", "shell", "secrets"]);
  if (!Array.isArray(value) || !value.every((item) => isCapability2(item, allowed))) {
    throw new RegistryValidationError("Invalid validation capabilities");
  }
  if (new Set(value).size !== value.length) throw new RegistryValidationError("Duplicate validation capability");
  return [...value];
}
function isCapability2(value, allowed) {
  return value === "filesystem-read" || value === "filesystem-write" || value === "network" || value === "shell" || value === "secrets" ? allowed.has(value) : false;
}
function file(value) {
  const record = exactRecord2(value, ["relativePath", "size", "mode"]);
  if (typeof record.size !== "number" || !Number.isSafeInteger(record.size) || record.size < 0 || typeof record.mode !== "number") {
    throw new RegistryValidationError("Invalid validation file");
  }
  return { relativePath: text3(record.relativePath, "relativePath"), size: record.size, mode: record.mode };
}
function finding(value) {
  const record = exactRecord2(value, ["ruleId", "severity", "file", "line", "message"]);
  const severity = trustSeverity(record.severity);
  if (typeof record.line !== "number" || !Number.isSafeInteger(record.line) || record.line < 1) throw new RegistryValidationError("Invalid finding line");
  return {
    ruleId: text3(record.ruleId, "finding.ruleId"),
    severity,
    file: text3(record.file, "finding.file"),
    line: record.line,
    message: text3(record.message, "finding.message")
  };
}
function trustSeverity(value) {
  if (value !== "info" && value !== "warning" && value !== "danger") throw new RegistryValidationError("Invalid finding severity");
  return value;
}
function list(value, parse2) {
  if (!Array.isArray(value)) throw new RegistryValidationError("Expected an array");
  return value.map(parse2);
}
function exactRecord2(value, required, optional = []) {
  if (!isRecord16(value)) throw new RegistryValidationError("Expected a plain object");
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw new RegistryValidationError("Registry record has an invalid shape");
  }
  return value;
}
function isRecord16(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function text3(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new RegistryValidationError(`${field} must be non-empty text`);
  return value;
}
function literal3(value, expected, field) {
  if (value !== expected) throw new RegistryValidationError(`${field} must equal ${expected}`);
}
function digest5(value, field) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError(`${field} must be a SHA-256 digest`);
  return value;
}
function packageHash4(value) {
  if (typeof value !== "string" || !/^sha256-v2:[0-9a-f]{64}$/.test(value)) throw new RegistryValidationError("Invalid validation package hash");
  return value;
}

// src/hub/client/release-materialize.ts
async function materializeHubReleaseCandidate(root4, verified) {
  const release = verified.release;
  const candidateId = localCandidateId(release.sourceCandidateId, release.hubInstanceId, release.releaseId);
  const reference = candidateReference(candidateId, verified);
  const layout = storeLayout(root4);
  await mkdir18(layout.staging, { recursive: true });
  const importRoot = await mkdtemp2(join30(layout.staging, "hub-release-"));
  let snapshot;
  try {
    const skillRoot = join30(importRoot, "skill");
    await writePackageBlob(skillRoot, verified.blob);
    const validation = await validateSkillPackage(skillRoot, {
      expectedName: release.name,
      expectedHash: release.packageHash
    });
    if (validation.packageHash !== release.packageHash) {
      throw new HubResponseValidationError(`Materialized package hash mismatch for release ${release.releaseId}`);
    }
    assertCapabilitiesMatch(validation.metadata.capabilities ?? [], release.capabilities);
    const existing = await readCandidateIfPresent(root4, candidateId);
    if (existing) return existingCandidate(reference, existing.packageHash);
    const operationId = `hub-import-${randomUUID8()}`;
    snapshot = await stageCandidateSnapshot(root4, operationId, skillRoot);
    const record = {
      candidateId,
      operationId,
      state: stateForFindings(validation.findings),
      metadata: validation.metadata,
      packageHash: validation.packageHash,
      createdAt: release.createdAt,
      createdBy: "agent",
      evidence: [
        `hub-instance:${release.hubInstanceId}`,
        `hub-release:${release.releaseId}`,
        `hub-release-sequence:${release.sequence}`,
        `hub-base-release:${release.supersedesReleaseHash ?? "none"}`
      ],
      findings: validation.findings,
      base: { kind: "none" }
    };
    try {
      await commitCandidateSnapshot(root4, record, snapshot);
      snapshot = void 0;
      return reference;
    } catch (error) {
      const raced = await readCandidateIfPresent(root4, candidateId);
      if (raced) return existingCandidate(reference, raced.packageHash);
      throw error;
    }
  } finally {
    if (snapshot) await discardCandidateSnapshot(snapshot).catch(() => void 0);
    await rm13(importRoot, { recursive: true, force: true });
  }
}
async function writePackageBlob(root4, value) {
  const blob = parsePackageBlob(value);
  await mkdir18(root4);
  for (const file2 of blob.files) {
    const path = join30(root4, ...file2.relativePath.split("/"));
    await mkdir18(dirname16(path), { recursive: true });
    await writeFile3(path, Buffer.from(file2.contentBase64, "base64"), { flag: "wx" });
    await chmod4(path, file2.mode);
  }
}
function candidateReference(candidateId, verified) {
  const release = verified.release;
  return Object.freeze({
    candidateId,
    packageHash: release.packageHash,
    hubInstanceId: release.hubInstanceId,
    releaseId: release.releaseId,
    releaseSequence: release.sequence,
    baseReleaseHash: release.supersedesReleaseHash,
    provenance: Object.freeze([...release.provenance])
  });
}
function localCandidateId(sourceCandidateId, hubInstanceId, releaseId) {
  if (sourceCandidateId.length <= 120 && /^cand-[a-zA-Z0-9-]+$/.test(sourceCandidateId)) return sourceCandidateId;
  const stable = createHash11("sha256").update(`${hubInstanceId}\0${sourceCandidateId}\0${releaseId}`).digest("hex").slice(0, 24);
  return `cand-hub-${stable}`;
}
async function readCandidateIfPresent(root4, candidateId) {
  try {
    return await readCandidate(root4, candidateId);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}
function existingCandidate(reference, packageHash5) {
  if (packageHash5 !== reference.packageHash) {
    throw new HubResponseValidationError(`Candidate ID collision with different package content: ${reference.candidateId}`);
  }
  return reference;
}
function assertCapabilitiesMatch(metadata2, release) {
  const left = [...metadata2].sort();
  const right = [...release].sort();
  if (left.length !== right.length || left.some((capability2, index) => capability2 !== right[index])) {
    throw new HubResponseValidationError("Materialized skill capabilities do not match the signed release");
  }
}
function isMissingFile(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/hub/client/trust.ts
function establishHubTrust(material, consent) {
  if (consent.explicit !== true || Number.isNaN(Date.parse(consent.trustedAt))) {
    throw new HubTrustNotEstablishedError();
  }
  return {
    version: 1,
    hubInstanceId: material.hubInstanceId,
    signingKeyFingerprint: canonicalSigningKeyFingerprint(material.releaseSigningPublicKey),
    trustedAt: consent.trustedAt
  };
}
function verifyHubTrust(trust, material) {
  if (!trust) throw new HubTrustNotEstablishedError();
  if (trust.hubInstanceId !== material.hubInstanceId) throw new HubTrustChangedError("hubInstanceId");
  if (trust.signingKeyFingerprint !== canonicalSigningKeyFingerprint(material.releaseSigningPublicKey)) {
    throw new HubTrustChangedError("signingKeyFingerprint");
  }
  return trust;
}

// src/hub/client/release-verify.ts
async function verifyHubReleaseBundle(input) {
  const verifier = trustedVerifier(input.trust, input.hub);
  const manifest = verifyManifest(verifier, input);
  const allowedCapabilities = new Set(input.allowedCapabilities);
  const artifacts = /* @__PURE__ */ new Map();
  for (const artifact of input.artifacts) {
    const releaseEnvelope = parseSignedEnvelope(artifact.release, parseRegistryRelease);
    const release = verifyRegistryPayload(verifier, releaseEnvelope, { hubInstanceId: input.hub.hubInstanceId });
    if (artifacts.has(release.releaseId)) {
      throw new HubResponseValidationError(`Duplicate release artifact: ${release.releaseId}`);
    }
    assertCapabilitiesAllowed(release.capabilities, allowedCapabilities);
    const blob = parsePackageBlob(artifact.blob);
    if (await hashPackageBlob(blob) !== release.packageHash) {
      throw new HubResponseValidationError(`Package blob hash mismatch for release ${release.releaseId}`);
    }
    artifacts.set(release.releaseId, Object.freeze({ release, blob }));
  }
  const releases = manifest.releases.map((entry) => {
    const artifact = artifacts.get(entry.releaseId);
    if (!artifact) throw new HubResponseValidationError(`Missing release artifact: ${entry.releaseId}`);
    assertManifestEntry(manifest, entry, artifact.release);
    artifacts.delete(entry.releaseId);
    return artifact;
  });
  if (artifacts.size > 0) {
    throw new HubResponseValidationError(`Release artifact is not present in manifest: ${artifacts.keys().next().value}`);
  }
  return Object.freeze({ manifest, sequence: manifest.sequence, releases: Object.freeze(releases) });
}
function verifyHubStableManifest(input) {
  const manifest = verifyManifest(trustedVerifier(input.trust, input.hub), input);
  assertStableManifest(manifest);
  return manifest;
}
async function verifyHubStableRelease(input) {
  const verifier = trustedVerifier(input.trust, input.hub);
  const manifest = verifyManifest(verifier, input);
  assertStableManifest(manifest);
  const releaseEnvelope = parseSignedEnvelope(input.artifact.release, parseRegistryRelease);
  const release = verifyRegistryPayload(verifier, releaseEnvelope, { hubInstanceId: input.hub.hubInstanceId });
  const entry = manifest.releases.find((candidate2) => candidate2.releaseId === release.releaseId);
  if (!entry) throw new HubResponseValidationError(`Release is not approved by the stable manifest: ${release.releaseId}`);
  assertManifestEntry(manifest, entry, release);
  const blob = parsePackageBlob(input.artifact.blob);
  if (await hashPackageBlob(blob) !== release.packageHash) {
    throw new HubResponseValidationError(`Package blob hash mismatch for release ${release.releaseId}`);
  }
  return Object.freeze({ release, blob });
}
function trustedVerifier(trust, hub) {
  verifyHubTrust(trust, hub);
  return createEd25519RegistryVerifier(hub.releaseSigningPublicKey);
}
function verifyManifest(verifier, input) {
  const manifestEnvelope = parseSignedEnvelope(input.manifest, parseChannelManifest);
  return verifyRegistryPayload(verifier, manifestEnvelope, {
    hubInstanceId: input.hub.hubInstanceId,
    ...input.afterSequence === void 0 ? {} : { afterSequence: input.afterSequence }
  });
}
function assertStableManifest(manifest) {
  if (manifest.channel !== "stable") {
    throw new HubResponseValidationError("Skill readers accept only the stable release channel");
  }
}
function parseSignedEnvelope(value, parsePayload) {
  assertKeys(value, ["payload", "signature"], "signed registry envelope");
  assertKeys(value.signature, ["algorithm", "keyFingerprint", "value"], "registry signature");
  if (value.signature.algorithm !== "Ed25519" || typeof value.signature.keyFingerprint !== "string" || typeof value.signature.value !== "string") {
    throw new HubResponseValidationError("Registry signature is malformed");
  }
  const signature2 = Object.freeze({
    algorithm: "Ed25519",
    keyFingerprint: value.signature.keyFingerprint,
    value: value.signature.value
  });
  return Object.freeze({ payload: parsePayload(value.payload), signature: signature2 });
}
function assertManifestEntry(manifest, entry, release) {
  if (release.channel !== manifest.channel || release.sequence !== entry.releaseSequence || release.name !== entry.name || release.version !== entry.version || release.packageHash !== entry.packageHash) {
    throw new HubResponseValidationError(`Manifest fields do not match signed release ${entry.releaseId}`);
  }
}
function assertCapabilitiesAllowed(capabilities2, allowedCapabilities) {
  const broadened = capabilities2.find((capability2) => !allowedCapabilities.has(capability2));
  if (broadened) {
    throw new HubResponseValidationError(`Release capability is not allowed by local policy: ${broadened}`);
  }
}
function assertKeys(value, keys, field) {
  if (!isPlainRecord(value)) throw new HubResponseValidationError(`${field} must be a plain object`);
  const expected = new Set(keys);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string" || !expected.has(key))) {
    throw new HubResponseValidationError(`${field} contains an unexpected field`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new HubResponseValidationError(`${field}.${key} is required`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || descriptor.get !== void 0 || descriptor.set !== void 0) {
      throw new HubResponseValidationError(`${field}.${key} must be a plain data field`);
    }
  }
}
function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

// src/hub/client/reconciler.ts
async function reconcileHubReleases(options) {
  const checkpoint = await readHubSyncState(options.root);
  let manifest;
  let artifacts;
  try {
    manifest = await options.remote.readStableManifest(checkpoint.lastEventSequence);
    if (!manifest) {
      return { mode: "up-to-date", sequence: checkpoint.lastEventSequence, imported: 0, applied: 0 };
    }
    artifacts = [];
    for (const reference of manifest.payload.releases) {
      const release = await options.remote.readRelease(reference.releaseId);
      const blob = await options.remote.readBlob(reference.packageHash);
      artifacts.push({ release, blob });
    }
  } catch (error) {
    if (error instanceof HubUnavailableError) {
      return { mode: "offline", sequence: checkpoint.lastEventSequence, imported: 0, applied: 0 };
    }
    throw error;
  }
  const verified = await verifyHubReleaseBundle({
    trust: options.trust,
    hub: options.hub,
    afterSequence: checkpoint.lastEventSequence,
    allowedCapabilities: options.allowedCapabilities,
    manifest,
    artifacts
  });
  if (verified.manifest.channel !== "stable") {
    throw new HubResponseValidationError("Reconciliation accepts only the stable release channel");
  }
  let imported = 0;
  let applied = 0;
  for (const release of verified.releases) {
    const candidate2 = await materializeHubReleaseCandidate(options.root, release);
    imported += 1;
    if (options.apply) {
      await options.apply.applyStableRelease({ root: options.root, release, candidate: candidate2 });
      applied += 1;
    }
  }
  await writeHubSyncState(options.root, { version: 1, lastEventSequence: verified.sequence });
  return { mode: "reconciled", sequence: verified.sequence, imported, applied };
}

// src/hub/client/registry-remote-schema.ts
function parseRegistryManifestEnvelope(value) {
  const data = parseDataEnvelope(value);
  return data === null ? null : parseSignedManifest(data);
}
function parseRegistryReleaseEnvelope(value) {
  return parseSignedRelease(parseDataEnvelope(value));
}
function parseRegistryBlobEnvelope(value) {
  return parsePackageBlob(parseDataEnvelope(value));
}
function parseDataEnvelope(value) {
  if (!isRecord17(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "data")) {
    throw new HubResponseValidationError("Registry response envelope is invalid");
  }
  return value.data;
}
function isRecord17(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

// src/hub/client/registry-remote.ts
function createRegistryRemotePort(client) {
  return {
    readStableManifest: async (afterSequence) => {
      try {
        return await client.request({
          method: "GET",
          path: `/v1/registry/channels/stable?afterSequence=${encodeURIComponent(afterSequence)}`,
          parse: parseRegistryManifestEnvelope
        });
      } catch (error) {
        if (error instanceof HubHttpError && error.status === 404) return null;
        throw error;
      }
    },
    readRelease: async (releaseId) => await client.request({
      method: "GET",
      path: `/v1/registry/releases/${encodeURIComponent(releaseId)}`,
      parse: parseRegistryReleaseEnvelope
    }),
    readBlob: async (packageHash5) => await client.request({
      method: "GET",
      path: `/v1/registry/blobs/${encodeURIComponent(packageHash5)}`,
      parse: parseRegistryBlobEnvelope
    })
  };
}

// src/hub/client/registry-mutation-schema.ts
function parseRegistryProposalEnvelope(value) {
  return parseCandidateRecord(value);
}
function parseRegistryPublishEnvelope(value) {
  return parsePublishResult(value);
}

// src/hub/client/registry-mutation.ts
function createRegistryMutationApi(root4, client) {
  return {
    propose: async (requestId2, input) => await executeDurableHubMutation({
      root: root4,
      client,
      input: { requestId: requestId2, method: "POST", path: "/v1/registry/proposals", body: JSON.stringify(input), createdAt: (/* @__PURE__ */ new Date()).toISOString() },
      replayable: true,
      parse: parseRegistryProposalEnvelope
    }),
    publish: async (requestId2, candidateId, version, workflowProof2) => await executeDurableHubMutation({
      root: root4,
      client,
      input: {
        requestId: requestId2,
        method: "POST",
        path: "/v1/registry/releases",
        body: JSON.stringify({ candidateId, version, channel: "stable", ...workflowProof2 === void 0 ? {} : { workflowProof: workflowProof2 } }),
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      replayable: true,
      parse: parseRegistryPublishEnvelope
    })
  };
}

// src/hub/client/registry-read.ts
var maximumStableReleases = 256;
function createRegistryReadApi(options) {
  return {
    listStableReleases: async (limit = 50) => {
      requireLimit(limit);
      const verified = await readStableManifest(options);
      const releases = verified === null ? [] : [...verified.manifest.releases].sort((left, right) => compareSequenceDescending(left.releaseSequence, right.releaseSequence)).slice(0, limit).map((release) => manifestReleaseSummary(release));
      return {
        channels: [{
          channel: "stable",
          sequence: verified?.manifest.sequence ?? "0",
          releases: Object.freeze(releases)
        }]
      };
    },
    readStableRelease: async (releaseId) => {
      requireReleaseId(releaseId);
      const stable = await readStableManifest(options);
      const entry = stable?.manifest.releases.find((release2) => release2.releaseId === releaseId);
      if (!entry || !stable) throw new HubStableReleaseNotFoundError(releaseId);
      const release = await options.remote.readRelease(entry.releaseId);
      const blob = await options.remote.readBlob(entry.packageHash);
      const verified = await verifyHubStableRelease({
        trust: options.trust,
        hub: options.hub,
        manifest: stable.envelope,
        artifact: { release, blob }
      });
      return releaseDetails(verified);
    }
  };
}
async function readStableManifest(options) {
  verifyHubTrust(options.trust, options.hub);
  const envelope = await options.remote.readStableManifest("0");
  if (envelope === null) return null;
  if (envelope.payload.releases.length > maximumStableReleases) {
    throw new HubResponseValidationError(`Stable manifest exceeds ${maximumStableReleases} readable releases`);
  }
  const manifest = verifyHubStableManifest({
    trust: options.trust,
    hub: options.hub,
    manifest: envelope
  });
  if (manifest.releases.length > maximumStableReleases) {
    throw new HubResponseValidationError(`Stable manifest exceeds ${maximumStableReleases} readable releases`);
  }
  return Object.freeze({ envelope, manifest });
}
function releaseDetails(verified) {
  const release = verified.release;
  return {
    release: releaseMetadata(release),
    evidence: {
      validationDigest: release.validationDigest,
      provenance: Object.freeze([...release.provenance]),
      supersedesReleaseHash: release.supersedesReleaseHash
    },
    files: Object.freeze(verified.blob.files.map((file2) => safeTextFile(file2)))
  };
}
function manifestReleaseSummary(release) {
  return {
    releaseId: release.releaseId,
    name: release.name,
    version: release.version,
    channel: "stable",
    sequence: release.releaseSequence,
    packageHash: release.packageHash
  };
}
function releaseMetadata(release) {
  return {
    releaseId: release.releaseId,
    name: release.name,
    version: release.version,
    channel: "stable",
    sequence: release.sequence,
    packageHash: release.packageHash,
    capabilities: Object.freeze([...release.capabilities]),
    createdAt: release.createdAt,
    createdBy: release.createdBy
  };
}
function safeTextFile(file2) {
  const content = Buffer.from(file2.contentBase64, "base64");
  return {
    relativePath: file2.relativePath,
    mode: file2.mode,
    content: new TextDecoder("utf-8", { fatal: true }).decode(content)
  };
}
function requireLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HubResponseValidationError("Stable release limit must be an integer from 1 to 100");
  }
}
function requireReleaseId(releaseId) {
  if (releaseId.length === 0 || releaseId.length > 200 || releaseId !== releaseId.trim() || releaseId.includes("\0")) {
    throw new HubResponseValidationError("Stable releaseId must be canonical text of at most 200 characters");
  }
}
function compareSequenceDescending(left, right) {
  const leftSequence = BigInt(left);
  const rightSequence = BigInt(right);
  return leftSequence === rightSequence ? 0 : leftSequence > rightSequence ? -1 : 1;
}

// src/hub/client/transport-config.ts
var DEFAULT_HUB_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5e3,
  maxRetryAfterMs: 3e4
};
var DEFAULT_HUB_TIMEOUT_MS = 5e3;
var DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
var SYSTEM_HUB_JITTER = (delayMs) => Math.floor(Math.random() * (delayMs + 1));
var MAX_HUB_RETRY_ATTEMPTS = 10;
var MAX_HUB_RETRY_DELAY_MS = 6e4;
var SYSTEM_HUB_CLOCK = {
  now: () => Date.now(),
  sleep: async (milliseconds) => await new Promise((resolve11) => setTimeout(resolve11, milliseconds))
};
var timeoutSequence = 0;
var systemTimeouts = /* @__PURE__ */ new Map();
var SYSTEM_HUB_TIMEOUT = {
  set: (handler, milliseconds) => {
    timeoutSequence += 1;
    systemTimeouts.set(timeoutSequence, setTimeout(handler, milliseconds));
    return timeoutSequence;
  },
  clear: (handle) => {
    if (typeof handle !== "number") return;
    const timeout = systemTimeouts.get(handle);
    if (timeout !== void 0) clearTimeout(timeout);
    systemTimeouts.delete(handle);
  }
};
function validateTransportOptions(options) {
  const retry = options.retry ?? DEFAULT_HUB_RETRY;
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > MAX_HUB_RETRY_ATTEMPTS || !Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0 || retry.baseDelayMs > MAX_HUB_RETRY_DELAY_MS || retry.maxDelayMs !== void 0 && (!Number.isFinite(retry.maxDelayMs) || retry.maxDelayMs < 0 || retry.maxDelayMs > MAX_HUB_RETRY_DELAY_MS) || retry.maxRetryAfterMs !== void 0 && (!Number.isFinite(retry.maxRetryAfterMs) || retry.maxRetryAfterMs < 0 || retry.maxRetryAfterMs > MAX_HUB_RETRY_DELAY_MS) || !Number.isFinite(options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS) || (options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS) <= 0 || !Number.isSafeInteger(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES) || (options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES) < 1) {
    throw new TypeError("Invalid Hub HTTP client options");
  }
}

// src/hub/client/response.ts
async function parseJsonResponse(response, maxBytes, parse2) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new HubResponseValidationError("Hub response must use application/json");
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new HubResponseValidationError("Hub response exceeds the configured size limit");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new HubResponseValidationError("Hub response exceeds the configured size limit");
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new HubResponseValidationError("Hub response is not valid JSON", { cause: error });
  }
  try {
    return parse2(value);
  } catch (error) {
    if (error instanceof HubProtocolError || error instanceof HubResponseValidationError) throw error;
    throw new HubResponseValidationError("Hub response schema is invalid", { cause: error });
  }
}

// src/hub/client/retry.ts
function retryDelay(retry, retryAfter, now, attempt, jitter) {
  const parsedRetryAfter = parseRetryAfter(retryAfter, now);
  const maximum = parsedRetryAfter === null ? retry.maxDelayMs ?? DEFAULT_HUB_RETRY.maxDelayMs : retry.maxRetryAfterMs ?? DEFAULT_HUB_RETRY.maxRetryAfterMs;
  const requested = parsedRetryAfter ?? exponentialDelay(retry.baseDelayMs, attempt);
  const bounded2 = Math.min(requested, maximum);
  const randomized = jitter(bounded2, attempt);
  return Number.isFinite(randomized) ? Math.max(0, Math.min(randomized, bounded2)) : bounded2;
}
function parseRetryAfter(value, now) {
  if (value === null) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) * 1e3 : null;
  const milliseconds = seconds ?? Date.parse(value) - now;
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}
function exponentialDelay(base, attempt) {
  return base * 2 ** Math.min(attempt - 1, 52);
}

// src/hub/client/transport.ts
var RETRYABLE_STATUSES = /* @__PURE__ */ new Set([408, 425, 429, 502, 503, 504]);
function createHubHttpClient(options) {
  validateTransportOptions(options);
  const baseUrl = validateHubUrl(options.baseUrl, true);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const clock = options.clock ?? SYSTEM_HUB_CLOCK;
  const timeout = options.timeout ?? SYSTEM_HUB_TIMEOUT;
  const retry = options.retry ?? DEFAULT_HUB_RETRY;
  const jitter = options.jitter ?? SYSTEM_HUB_JITTER;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  return {
    request: async (request) => {
      const prepared = prepareRequest(request);
      for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
        let retryAfter = null;
        try {
          const response = await fetchWithTimeout(fetchImpl, new URL(prepared.path, baseUrl), prepared.init, timeoutMs, timeout);
          if (!response.ok) {
            const error = new HubHttpError(response.status);
            if (!prepared.retryable || !RETRYABLE_STATUSES.has(response.status) || attempt === retry.maxAttempts) throw error;
            retryAfter = response.headers.get("retry-after");
          } else {
            return await parseJsonResponse(response, maxResponseBytes, request.parse);
          }
        } catch (error) {
          if (error instanceof HubHttpError) {
            if (!prepared.retryable || !RETRYABLE_STATUSES.has(error.status) || attempt === retry.maxAttempts) throw error;
          } else if (!isNetworkAmbiguity(error)) {
            throw error;
          } else if (!prepared.retryable || attempt === retry.maxAttempts) {
            if (isAbort(error)) throw new HubTimeoutError(void 0, { cause: error });
            throw new HubUnavailableError(void 0, { cause: error });
          }
        }
        await clock.sleep(retryDelay(retry, retryAfter, clock.now(), attempt, jitter));
      }
      throw new HubUnavailableError();
    }
  };
}
function prepareRequest(request) {
  if ("mutation" in request) {
    const mutation = parsePendingHubMutation(request.mutation);
    return {
      path: mutation.path,
      init: {
        method: mutation.method,
        body: mutation.body,
        headers: { "content-type": "application/json", "idempotency-key": mutation.requestId },
        redirect: "error"
      },
      retryable: request.replayable
    };
  }
  if (!isSafeRequestPath(request.path)) throw new TypeError("Hub request path is unsafe");
  if (request.method === "POST") {
    return {
      path: request.path,
      init: { method: "POST", body: request.body, headers: { "content-type": "application/json" }, redirect: "error" },
      retryable: true
    };
  }
  return { path: request.path, init: { method: request.method, redirect: "error" }, retryable: true };
}
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs, timeout) {
  const controller = new AbortController();
  const handle = timeout.set(() => controller.abort(new DOMException("Hub request timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    timeout.clear(handle);
  }
}
function isSafeRequestPath(path) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("#");
}
function isNetworkAmbiguity(error) {
  return error instanceof TypeError || isAbort(error);
}
function isAbort(error) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
}

// src/hub/client/tailscale-status.ts
async function readTailscaleMagicDnsSuffix(process2) {
  const result = await process2.run("tailscale", ["status", "--json"]);
  if (result.exitCode !== 0) {
    throw new HubDiscoveryConfigurationError("tailscale status --json failed");
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch (error) {
    throw new HubDiscoveryConfigurationError("tailscale status did not return JSON", { cause: error });
  }
  if (!isRecord18(value) || typeof value.MagicDNSSuffix !== "string") {
    throw new HubDiscoveryConfigurationError("tailscale status is missing MagicDNSSuffix");
  }
  const suffix = value.MagicDNSSuffix.trim().replace(/\.$/, "").toLowerCase();
  if (suffix.length === 0) throw new HubDiscoveryConfigurationError("tailscale status has an empty MagicDNSSuffix");
  return suffix;
}
function isRecord18(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hub/client/session.ts
async function previewHubSession(options) {
  const resolved = await resolveSession(options, false);
  if (resolved.mode === "local-only") throw new HubUnavailableError("Skillloom Hub could not be verified during setup");
  return resolved;
}
async function trustHubSession(root4, preview, consent) {
  const trust = establishHubTrust(preview.negotiation, consent);
  await writeHubTrust(root4, trust);
  await writeHubEndpoint(root4, preview.endpoint);
}
async function openHubSession(options) {
  const trust = await readHubTrust(options.root);
  if (!trust) throw new HubTrustNotEstablishedError();
  return await resolveSession(options, true);
}
async function resolveSession(options, verifyOnly) {
  const cachedEndpoint = await readHubEndpoint(options.root);
  const magicDnsSuffix = await optionalMagicDnsSuffix(options.tailscaleStatus);
  const negotiated = /* @__PURE__ */ new Map();
  const trust = verifyOnly ? await readHubTrust(options.root) : null;
  const discovery = await discoverHub({
    ...options.developmentUrl === void 0 ? {} : { developmentUrl: options.developmentUrl },
    cachedEndpoint,
    ...magicDnsSuffix === void 0 ? {} : { magicDnsSuffix },
    ...options.now === void 0 ? {} : { now: options.now },
    probe: async (candidate2) => {
      const client = options.createClient(candidate2.url);
      try {
        const response = await negotiateHub(client, options.clientVersion);
        if (verifyOnly) verifyHubTrust(trust, response);
        negotiated.set(candidate2.url, { client, response });
        return true;
      } catch (error) {
        if (isUnavailableCandidate(error)) return false;
        throw error;
      }
    }
  });
  if (discovery.mode === "local-only") return discovery;
  const value = negotiated.get(discovery.endpoint.url);
  if (!value) throw new HubUnavailableError("Skillloom Hub negotiation did not complete");
  if (verifyOnly) await writeHubEndpoint(options.root, discovery.endpoint);
  return {
    mode: "connected",
    endpoint: discovery.endpoint,
    negotiation: value.response,
    client: value.client,
    attempted: discovery.attempted
  };
}
async function optionalMagicDnsSuffix(process2) {
  if (!process2) return void 0;
  try {
    return await readTailscaleMagicDnsSuffix(process2);
  } catch {
    return void 0;
  }
}
function isUnavailableCandidate(error) {
  if (error instanceof HubUnavailableError || error instanceof HubTimeoutError || error instanceof TypeError) return true;
  return error instanceof HubHttpError && [404, 408, 425, 429, 502, 503, 504].includes(error.status);
}

// src/host/backend-health.ts
var localBackendUrls = [
  "http://127.0.0.1:8787/healthz",
  "http://127.0.0.1:3000/"
];
async function localBackendsHealthy(request = fetch) {
  const checks = await Promise.all(localBackendUrls.map(async (url) => {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(5e3) });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }));
  return checks.every(Boolean);
}
async function waitForLocalBackends(probe = localBackendsHealthy, wait = async (milliseconds) => await new Promise((resolve11) => setTimeout(resolve11, milliseconds)), attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probe()) return true;
    if (attempt + 1 < attempts) await wait(1e3);
  }
  return false;
}

// src/host/capability-health.ts
async function hubCapabilitiesHealthy(processes, hubUrl, environment) {
  const url = new URL("/v1/hello", hubUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net")) return false;
  const curl = await processes.findExecutable("curl");
  if (!curl) return false;
  const response = await processes.run(curl, [
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--max-time",
    "5",
    "--proto",
    "=https",
    "--max-redirs",
    "0",
    url.href
  ], environment, 7e3);
  if (response.exitCode !== 0) return false;
  try {
    const body = JSON.parse(response.stdout);
    return isRecord19(body) && isRecord19(body.tailnetIdentity) && typeof body.tailnetIdentity.actorId === "string" && Array.isArray(body.grantedCapabilities) && body.grantedCapabilities.includes("brain:read") && body.grantedCapabilities.includes("skill:read");
  } catch {
    return false;
  }
}
function isRecord19(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/host/docker-readiness.ts
import { setTimeout as delay } from "node:timers/promises";
async function ensureDockerReady(processes, docker, options) {
  if (await daemonReady(processes, docker, options.env)) return;
  if (options.platform !== "darwin") {
    throw new UsageError("Docker is installed but its daemon is not running; start Docker and rerun setup");
  }
  const open5 = await processes.findExecutable("open");
  if (!open5) throw new UsageError("Docker Desktop is installed but Skillloom could not start it; open Docker and rerun setup");
  const start = await processes.run(open5, ["-a", "Docker"], options.env);
  if (start.exitCode !== 0) throw new UsageError("Docker Desktop could not be started; open Docker and rerun setup");
  const wait = options.wait ?? delay;
  const deadline = Date.now() + 6e4;
  while (Date.now() < deadline) {
    await wait(1e3);
    if (await daemonReady(processes, docker, options.env)) return;
  }
  throw new UsageError("Docker Desktop did not become ready within 60 seconds; wait for it to finish starting and rerun setup");
}
async function daemonReady(processes, docker, environment) {
  return (await processes.run(docker, ["info"], environment)).exitCode === 0;
}

// src/host/policy.ts
function loginNameFromTailscaleStatus(stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord20(value) || !isRecord20(value.Self) || !isRecord20(value.User)) return null;
  const userId = value.Self.UserID;
  if (typeof userId !== "string" && typeof userId !== "number") return null;
  const user = value.User[String(userId)];
  if (!isRecord20(user) || typeof user.LoginName !== "string") return null;
  const loginName = user.LoginName.trim();
  return loginName.length > 0 && !/[\u0000-\u001f\u007f]/u.test(loginName) ? loginName : null;
}
function personalPolicyFragment(loginName) {
  const source = JSON.stringify(loginName);
  const subject = JSON.stringify(`user:${loginName}`);
  return [
    "// Merge the entry below into the existing top-level grants array.",
    "// Do not replace the rest of the tailnet policy with this fragment.",
    "{",
    "  grants: [",
    "    {",
    `      src: [${source}],`,
    '      dst: ["autogroup:self"],',
    '      ip: ["tcp:443", "tcp:8443"],',
    "      app: {",
    '        "skillloom.io/cap/skillloom": [',
    "          {",
    `            subject: ${subject},`,
    '            roles: ["reader", "contributor", "promoter"],',
    "          },",
    "        ],",
    "      },",
    "    },",
    "  ],",
    "}",
    ""
  ].join("\n");
}
function isRecord20(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/host/obsidian-workspace.ts
import { readFile as readFile16 } from "node:fs/promises";
import { join as join31 } from "node:path";
var WORKSPACE_FILES = ["workspace.json", "workspace-mobile.json"];
async function prepareObsidianWorkspace(vaultConfigRoot) {
  await Promise.all(WORKSPACE_FILES.map(async (file2) => {
    const path = join31(vaultConfigRoot, file2);
    const source = await readWorkspace(path);
    if (source === null) return;
    const migrated = migrateWorkspaceValue(source.value);
    const content = JSON.stringify(migrated);
    if (content !== JSON.stringify(source.value)) {
      await atomicWriteFile(path, content, { mode: 384 });
    }
  }));
}
async function readWorkspace(path) {
  try {
    return { value: JSON.parse(await readFile16(path, "utf8")) };
  } catch (error) {
    if (isMissing3(error)) return null;
    if (error instanceof SyntaxError) throw new Error(`Obsidian workspace is malformed at ${path}`, { cause: error });
    throw error;
  }
}
function migrateWorkspaceValue(value) {
  if (typeof value === "string") {
    return value.replace(/^Library\.(?:next|previous)\//u, "Library/").replace(/^Library\/Bases(?=\/|$)/u, "Bases");
  }
  if (Array.isArray(value)) return value.map(migrateWorkspaceValue);
  if (!isRecord21(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, migrateWorkspaceValue(entry)]));
}
function isRecord21(value) {
  return typeof value === "object" && value !== null;
}
function isMissing3(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/host/state.ts
import { access as access4, chmod as chmod5, mkdir as mkdir20 } from "node:fs/promises";
import { join as join33 } from "node:path";

// src/host/obsidian-profile.ts
import { createHash as createHash12 } from "node:crypto";
import { mkdir as mkdir19, readFile as readFile17 } from "node:fs/promises";
import { join as join32 } from "node:path";
var VAULT_PATH = "/config/Documents/Skillloom";
async function prepareObsidianProfile(configRoot, now = Date.now()) {
  const profileDirectory = join32(configRoot, ".config", "obsidian");
  const profilePath = join32(profileDirectory, "obsidian.json");
  await mkdir19(profileDirectory, { recursive: true, mode: 448 });
  const current = await readProfile(profilePath);
  const vaults = isRecord22(current.vaults) ? current.vaults : {};
  const matchingEntry = Object.entries(vaults).find(([, value]) => isRecord22(value) && value.path === VAULT_PATH);
  const vaultId = matchingEntry?.[0] ?? createHash12("sha256").update(VAULT_PATH).digest("hex").slice(0, 16);
  const existingVault = isRecord22(vaults[vaultId]) ? vaults[vaultId] : {};
  const nextVaults = Object.fromEntries(
    Object.entries(vaults).map(([id, value]) => [
      id,
      isRecord22(value) ? { ...value, open: id === vaultId } : value
    ])
  );
  nextVaults[vaultId] = {
    ...existingVault,
    path: VAULT_PATH,
    ts: typeof existingVault.ts === "number" ? existingVault.ts : now,
    open: true
  };
  await atomicWriteFile(profilePath, JSON.stringify({ ...current, vaults: nextVaults }), { mode: 384 });
}
async function readProfile(path) {
  try {
    const value = JSON.parse(await readFile17(path, "utf8"));
    if (!isRecord22(value)) throw new Error("profile root must be an object");
    return value;
  } catch (error) {
    if (isMissing4(error)) return {};
    if (error instanceof SyntaxError) throw new Error(`Obsidian profile is malformed at ${path}`, { cause: error });
    throw error;
  }
}
function isRecord22(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMissing4(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/host/state.ts
async function prepareHostState(hostRoot, policyFragment) {
  const paths = hostPaths(hostRoot);
  await Promise.all([
    secureDirectory(hostRoot),
    secureDirectory(paths.data),
    secureDirectory(paths.obsidianConfig),
    secureDirectory(paths.obsidianVaultConfig),
    secureDirectory(paths.obsidianProjectionRoot),
    secureDirectory(paths.obsidianVaultConfigMountpoint),
    secureDirectory(paths.obsidianBasesMountpoint),
    secureDirectory(paths.obsidianAuthoringMountpoint),
    secureDirectory(paths.obsidianBases),
    secureDirectory(paths.obsidianAuthoring)
  ]);
  await prepareObsidianProfile(paths.obsidianConfig);
  await prepareObsidianWorkspace(paths.obsidianVaultConfig);
  await atomicWriteFile(paths.envFile, hostEnvironment(paths), { mode: 384 });
  await atomicWriteFile(paths.policy, policyFragment, { mode: 384 });
  return paths;
}
async function hostStateExists(hostRoot) {
  try {
    await access4(hostPaths(hostRoot).envFile);
    return true;
  } catch (error) {
    if (isMissing5(error)) return false;
    throw error;
  }
}
function hostPaths(hostRoot) {
  return {
    root: hostRoot,
    data: join33(hostRoot, "data"),
    obsidianConfig: join33(hostRoot, "obsidian-config"),
    obsidianVaultConfig: join33(hostRoot, "obsidian-config", "vault-config"),
    obsidianProjectionRoot: join33(hostRoot, "data", "brain", "projections", "obsidian-vault"),
    obsidianVaultConfigMountpoint: join33(hostRoot, "data", "brain", "projections", "obsidian-vault", ".obsidian"),
    obsidianBasesMountpoint: join33(hostRoot, "data", "brain", "projections", "obsidian-vault", "Bases"),
    obsidianAuthoringMountpoint: join33(hostRoot, "data", "brain", "projections", "obsidian-vault", "Authoring"),
    obsidianBases: join33(hostRoot, "data", "brain", "obsidian-ui", "Bases"),
    obsidianAuthoring: join33(hostRoot, "data", "brain", "authoring"),
    envFile: join33(hostRoot, "host.env"),
    policy: join33(hostRoot, "policy.hujson")
  };
}
function hostEnvironment(paths) {
  return [
    `SKILLLOOM_HUB_DATA_DIR=${quote(paths.data)}`,
    `SKILLLOOM_OBSIDIAN_CONFIG_DIR=${quote(paths.obsidianConfig)}`,
    ""
  ].join("\n");
}
function quote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
async function secureDirectory(path) {
  await mkdir20(path, { recursive: true, mode: 448 });
  await chmod5(path, 448);
}
function isMissing5(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/host/surfaces.ts
function surfacesFromTailscaleStatus(stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord23(value) || !isRecord23(value.Self) || typeof value.Self.DNSName !== "string") return null;
  const host = value.Self.DNSName.trim().replace(/\.$/u, "").toLowerCase();
  if (!host) return null;
  return {
    hub: { url: `https://${host}`, externalPort: 443, internalPort: 8787, access: "read-write" },
    obsidian: {
      url: `https://${host}:8443`,
      externalPort: 8443,
      internalPort: 3e3,
      workspaces: {
        library: { path: "Library", access: "read-only" },
        dashboards: { path: "Bases", access: "writable-ui-state" },
        authoring: { path: "Authoring", access: "writable-staging" }
      }
    }
  };
}
function isRecord23(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/host/tailscale-serve.ts
async function configurePrivateServe(processes, tailscale, environment, platform) {
  await configure(
    processes,
    tailscale,
    environment,
    platform,
    "443",
    "http://127.0.0.1:8787",
    "Skillloom Hub",
    "skillloom.io/cap/skillloom"
  );
  await configure(processes, tailscale, environment, platform, "8443", "http://127.0.0.1:3000", "Obsidian");
  if (!await privateServeConfigured(processes, tailscale, environment)) {
    throw new Error("Tailscale Serve verification failed; Docker state was preserved for retry");
  }
}
async function privateServeConfigured(processes, tailscale, environment) {
  const status = await processes.run(tailscale, ["serve", "status"], environment, 1e4);
  return status.exitCode === 0 && !/funnel/iu.test(status.stdout) && status.stdout.includes("127.0.0.1:8787") && status.stdout.includes("127.0.0.1:3000");
}
async function configure(processes, tailscale, environment, platform, port, target, surface, acceptedCapability) {
  const capabilityArgs = acceptedCapability ? [`--accept-app-caps=${acceptedCapability}`] : [];
  const result = await processes.run(
    tailscale,
    ["serve", "--bg", "--yes", ...capabilityArgs, `--https=${port}`, target],
    environment,
    15e3
  );
  if (result.exitCode === 0) return;
  const approvalUrl = tailscaleApprovalUrl(result);
  if (approvalUrl) {
    await openApprovalPage(processes, approvalUrl, environment, platform);
    throw new UsageError(`Tailscale Serve needs one-time tailnet approval. Approve ${approvalUrl} and rerun setup; Docker state was preserved.`);
  }
  throw new Error(`Tailscale Serve could not publish ${surface}; Docker state was preserved for retry`);
}
function tailscaleApprovalUrl(result) {
  const candidate2 = `${result.stdout}
${result.stderr}`.match(/https:\/\/login\.tailscale\.com\/f\/serve\?[^\s]+/u)?.[0];
  if (!candidate2) return null;
  const url = new URL(candidate2);
  return url.protocol === "https:" && url.hostname === "login.tailscale.com" && url.pathname === "/f/serve" ? url.href : null;
}
async function openApprovalPage(processes, url, environment, platform) {
  if (platform !== "darwin") return;
  const open5 = await processes.findExecutable("open");
  if (open5) await processes.run(open5, [url], environment, 1e4);
}

// src/host/service.ts
var HostService = class {
  constructor(dependencies, options) {
    this.dependencies = dependencies;
    this.options = options;
  }
  dependencies;
  options;
  async install(yes) {
    await this.requireConsent(yes);
    const tailscaleSession = await this.requireAuthenticatedTailscale();
    const loginName = loginNameFromTailscaleStatus(tailscaleSession.status);
    if (!loginName) {
      throw new UsageError("Main Hub setup needs an authenticated Tailscale user identity; tagged or headless hosts require an explicit advanced tailnet policy");
    }
    const existingState = await hostStateExists(this.options.hostRoot);
    const paths = await prepareHostState(this.options.hostRoot, personalPolicyFragment(loginName));
    const docker = await this.requireDocker();
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    if (existingState) {
      const stopped = await this.dependencies.processes.run(docker, [...compose, "stop", "obsidian"], this.options.env);
      if (stopped.exitCode !== 0) {
        throw new Error("Docker Compose could not pause Obsidian for a safe workspace migration");
      }
      await prepareObsidianWorkspace(paths.obsidianVaultConfig);
    }
    const start = [...compose, "up", "-d", "--build", "--wait", "--wait-timeout", "180"];
    const result = await this.dependencies.processes.run(docker, start, this.options.env);
    if (result.exitCode !== 0) {
      await this.dependencies.processes.run(docker, [...compose, "down"], this.options.env);
      throw new Error("Docker Compose could not start Skillloom Hub; the containers were removed while persistent state was preserved");
    }
    await configurePrivateServe(
      this.dependencies.processes,
      tailscaleSession.executable,
      this.options.env,
      this.options.platform ?? process.platform
    );
    const installed = await this.result("install", docker, paths);
    if (installed.status !== "running") {
      throw new UsageError("Skillloom containers started, but their host-loopback backends are not reachable; persistent state was preserved for retry");
    }
    return installed;
  }
  async status() {
    if (!await hostStateExists(this.options.hostRoot)) {
      return this.emptyResult("status", "stopped", ["Run the Skillloom setup skill and choose host install"]);
    }
    const docker = await this.requireDocker();
    return await this.result("status", docker, hostPaths(this.options.hostRoot));
  }
  async result(action, docker, paths) {
    const compose = ["compose", "--env-file", paths.envFile, "-f", this.composeFile()];
    const ps = await this.dependencies.processes.run(docker, [...compose, "ps", "--status", "running", "--services"]);
    const composeRunning = ps.exitCode === 0 && ps.stdout.includes("skillloom-hub") && ps.stdout.includes("obsidian");
    const probe = this.dependencies.localBackendsHealthy ?? localBackendsHealthy;
    const backendsHealthy = composeRunning && (action === "install" ? await waitForLocalBackends(probe, this.dependencies.wait) : await probe());
    const status = !composeRunning ? "stopped" : backendsHealthy ? "running" : "degraded";
    const tailscaleExecutable = await this.dependencies.processes.findExecutable("tailscale");
    const tailscale = status === "running" && tailscaleExecutable ? await this.dependencies.processes.run(tailscaleExecutable, ["status", "--json"]) : { exitCode: 1, stdout: "", stderr: "" };
    const serveReady = tailscale.exitCode === 0 && tailscaleExecutable !== null && await privateServeConfigured(this.dependencies.processes, tailscaleExecutable, this.options.env);
    const surfaces = serveReady ? surfacesFromTailscaleStatus(tailscale.stdout) : null;
    const capabilitiesReady = surfaces ? await hubCapabilitiesHealthy(this.dependencies.processes, surfaces.hub.url, this.options.env) : false;
    const nextActions = status === "running" ? [
      ...capabilitiesReady ? [] : [`Merge the personalized grant in ${paths.policy} into the existing top-level grants array in the Tailscale admin console`],
      "Open the printed Hub and Obsidian URLs from another device in the same tailnet",
      ...surfaces ? [] : ["Rerun skillloom host status after Tailscale reports its MagicDNS suffix"]
    ] : status === "degraded" ? ["Inspect Docker Compose logs because the containers are running but their host-loopback backends are unreachable, then rerun skillloom host install"] : ["Inspect Docker Compose logs and rerun skillloom host install"];
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces, nextActions };
  }
  async requireConsent(yes) {
    if (yes) return;
    if (!this.dependencies.consent.interactive) throw new UsageError("Non-interactive host installation requires --yes");
    if (!await this.dependencies.consent.confirm("Install and start the private Skillloom Hub and Obsidian Web UI with a read-only Library and writable Authoring workspace?")) {
      throw new UsageError("Host installation declined; no Docker changes were made");
    }
  }
  async requireDocker() {
    const docker = await this.dependencies.processes.findExecutable("docker");
    if (!docker) throw new UsageError("Docker with Compose v2 is required to host Skillloom");
    const version = await this.dependencies.processes.run(docker, ["compose", "version"]);
    if (version.exitCode !== 0) throw new UsageError("Docker Compose v2 is required to host Skillloom");
    await ensureDockerReady(this.dependencies.processes, docker, {
      env: this.options.env,
      platform: this.options.platform ?? process.platform,
      ...this.dependencies.wait ? { wait: this.dependencies.wait } : {}
    });
    return docker;
  }
  async requireAuthenticatedTailscale() {
    const tailscale = await this.dependencies.processes.findExecutable("tailscale");
    if (!tailscale) throw new UsageError("Tailscale CLI is required on the Main Hub host; install it and sign in before rerunning setup");
    const status = await this.dependencies.processes.run(tailscale, ["status", "--json"]);
    if (status.exitCode !== 0) throw new UsageError("Main Hub setup needs a human Tailscale login on this host before Skillloom can publish private Serve URLs");
    return { executable: tailscale, status: status.stdout };
  }
  composeFile() {
    return `${this.options.packageRoot}/hub/compose.yaml`;
  }
  emptyResult(action, status, nextActions) {
    const paths = hostPaths(this.options.hostRoot);
    return { command: "host", action, status, root: paths.root, policyPath: paths.policy, surfaces: null, nextActions };
  }
};

// src/hub/mcp/registry-read-schema.ts
function parseRegistryMcpReleases(value) {
  const input = strictObject3(value, ["limit"]);
  if (input.limit !== void 0 && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw validationError2("skill_releases limit must be an integer from 1 to 100");
  }
  return input.limit === void 0 ? {} : { limit: input.limit };
}
function parseRegistryMcpRead(value) {
  const input = strictObject3(value, ["releaseId"]);
  if (typeof input.releaseId !== "string" || input.releaseId.length === 0 || input.releaseId.length > 200 || input.releaseId !== input.releaseId.trim() || input.releaseId.includes("\\0")) {
    throw validationError2("skill_read releaseId must be canonical text of at most 200 characters");
  }
  return { releaseId: input.releaseId };
}
function strictObject3(value, allowedKeys) {
  if (!isRecord10(value)) throw validationError2("Tool arguments must be an object");
  const unknown = unknownKeys(value, allowedKeys);
  if (unknown.length > 0) throw validationError2(`Unknown tool arguments: ${unknown.sort().join(", ")}`);
  return value;
}
function validationError2(message2) {
  return new BrainMcpError("BRAIN_MCP_VALIDATION_ERROR", message2);
}

// src/setup/bridge-remote.ts
var HubApiBridgeAdapter = class {
  constructor(apis) {
    this.apis = apis;
  }
  apis;
  async call(call) {
    const value = isBrainCall(call) ? await dispatchBrain(this.apis.brain, call) : await dispatchRegistry(this.apis.registry, call);
    return toolResult(value);
  }
};
var LazyHubApiBridgeAdapter = class {
  constructor(connect) {
    this.connect = connect;
  }
  connect;
  apis;
  async call(call) {
    this.apis ??= this.connect().catch((error) => {
      this.apis = void 0;
      throw error;
    });
    return await new HubApiBridgeAdapter(await this.apis).call(call);
  }
};
async function dispatchBrain(api, call) {
  if (call.name === "brain_search") return await api.search(parseBrainMcpSearch(call.arguments));
  if (call.name === "brain_retrieve") return await api.retrieve(parseBrainMcpRetrieve(call.arguments));
  if (call.name === "brain_health") {
    parseBrainMcpHealth(call.arguments);
    return await api.health();
  }
  if (call.name === "brain_read") return await api.read(parseBrainMcpRead(call.arguments).artifactId);
  if (call.name === "brain_capture") {
    const { requestId: requestId3, ...input2 } = parseBrainMcpCapture(call.arguments);
    return await api.capture(requestId3, input2);
  }
  if (call.name === "brain_update") {
    const { requestId: requestId3, artifactId: artifactId2, ...input2 } = parseBrainMcpUpdate(call.arguments);
    return await api.update(requestId3, artifactId2, input2);
  }
  const { requestId: requestId2, sourceArtifactId, ...input } = parseBrainMcpLink(call.arguments);
  return await api.link(requestId2, sourceArtifactId, input);
}
async function dispatchRegistry(api, call) {
  if (call.name === "skill_releases") {
    const { limit } = parseRegistryMcpReleases(call.arguments);
    return await api.listStableReleases(limit);
  }
  if (call.name === "skill_read") {
    return await api.readStableRelease(parseRegistryMcpRead(call.arguments).releaseId);
  }
  if (call.name === "skill_propose") {
    const { requestId: requestId2, ...input2 } = parseRegistryMcpPropose(call.arguments);
    return await api.propose(requestId2, input2);
  }
  const input = parseRegistryMcpPublish(call.arguments);
  return await api.publish(input.requestId, input.candidateId, input.version, input.workflowProof);
}
function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: Array.isArray(value) ? { results: value } : value
  };
}
function isBrainCall(call) {
  return call.name.startsWith("brain_");
}

// src/setup/consent.ts
import { createInterface } from "node:readline/promises";
var TerminalConsentPort = class {
  constructor(input = process.stdin, output = process.stdout) {
    this.input = input;
    this.output = output;
    this.interactive = input.isTTY === true && output.isTTY === true;
  }
  input;
  output;
  interactive;
  async confirm(message2) {
    const prompt = createInterface({ input: this.input, output: this.output });
    try {
      const answer = await prompt.question(`${message2} [y/N] `);
      return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    } finally {
      prompt.close();
    }
  }
};

// src/setup/environment.ts
var SetupEnvironmentDetector = class {
  constructor(processes) {
    this.processes = processes;
  }
  processes;
  async detect() {
    const tailscale = await this.detectTailscale();
    const docker = await this.detectDocker();
    return { tailscale, docker };
  }
  async detectTailscale() {
    const executable = await this.processes.findExecutable("tailscale");
    if (!executable) return "missing";
    const status = await this.processes.run(executable, ["status", "--json"]);
    return status.exitCode === 0 ? "authenticated" : "needs-login";
  }
  async detectDocker() {
    const executable = await this.processes.findExecutable("docker");
    if (!executable) return "missing";
    const compose = await this.processes.run(executable, ["compose", "version"]);
    return compose.exitCode === 0 ? "available" : "missing";
  }
};

// src/setup/guidance-sources.ts
import { createHash as createHash13 } from "node:crypto";
var OFFICIAL_DOCS = [
  { title: "Tailscale Serve", url: "https://tailscale.com/docs/features/tailscale-serve" },
  { title: "Tailscale serve command", url: "https://tailscale.com/docs/reference/tailscale-cli/serve" },
  { title: "Tailscale application capabilities", url: "https://tailscale.com/docs/features/access-control/grants/grants-app-capabilities" },
  { title: "Tailscale visual policy editor", url: "https://tailscale.com/docs/features/visual-editor" },
  { title: "Docker Compose install", url: "https://docs.docker.com/compose/install/" }
];
var ALLOWED_HOSTS = /* @__PURE__ */ new Set(["tailscale.com", "docs.docker.com"]);
var DynamicSetupGuidanceSources = class {
  constructor(processes, fetchText) {
    this.processes = processes;
    this.fetchText = fetchText;
  }
  processes;
  fetchText;
  async collect() {
    const docs = await Promise.all(OFFICIAL_DOCS.map(async (doc) => await this.fetchOfficialDoc(doc)));
    const found = docs.filter((source) => source !== null);
    if (found.length > 0) return found;
    return await this.collectCliHelp();
  }
  async fetchOfficialDoc(doc) {
    if (!ALLOWED_HOSTS.has(new URL(doc.url).hostname)) return null;
    try {
      const { body, fetchedAt } = await this.retrieveDoc(doc.url);
      return {
        kind: "official-doc",
        title: doc.title,
        url: doc.url,
        fetchedAt,
        ...pageDate(body),
        contentHash: hash(body),
        snippets: snippets(body)
      };
    } catch {
      return null;
    }
  }
  async retrieveDoc(url) {
    if (this.fetchText) return await this.fetchText(url);
    const curl = await this.processes.findExecutable("curl");
    if (!curl) throw new Error("curl unavailable");
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const response = await this.processes.run(curl, [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "3",
      "--proto",
      "=https",
      "--header",
      "Cache-Control: no-cache",
      "--header",
      "Pragma: no-cache",
      url
    ]);
    if (response.exitCode !== 0) throw new Error(response.stderr || `curl exited ${response.exitCode}`);
    return { body: response.stdout, fetchedAt };
  }
  async collectCliHelp() {
    const sources = [];
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const tailscale = await this.processes.findExecutable("tailscale");
    if (tailscale) {
      const help = await this.processes.run(tailscale, ["serve", "--help"]);
      if (help.exitCode === 0) {
        sources.push({ kind: "cli-help", title: "tailscale serve --help", fetchedAt, contentHash: hash(help.stdout), snippets: snippets(help.stdout) });
      }
    }
    const docker = await this.processes.findExecutable("docker");
    if (docker) {
      const help = await this.processes.run(docker, ["compose", "--help"]);
      if (help.exitCode === 0) {
        sources.push({ kind: "cli-help", title: "docker compose --help", fetchedAt, contentHash: hash(help.stdout), snippets: snippets(help.stdout) });
      }
    }
    return sources;
  }
};
function pageDate(body) {
  const match = body.match(/(?:Published|Last validated):\s*([^<|\n]+)/iu);
  return match?.[1] ? { pageDate: match[1].trim() } : {};
}
function hash(value) {
  return `sha256:${createHash13("sha256").update(value).digest("base64url")}`;
}
function snippets(body) {
  const matches2 = body.split(/\r?\n/u).map((line) => sanitizeSnippet(line)).filter((line) => !/\bfunnel\b/iu.test(line)).filter((line) => /(serve|service|compose|docker|login|auth|tailscale|grant|capabilit|policy|access control)/iu.test(line)).filter(Boolean).slice(0, 3).map((line) => line.slice(0, 180));
  return matches2.length > 0 ? matches2 : [sanitizeSnippet(body)].filter(Boolean);
}
function sanitizeSnippet(line) {
  return line.replace(/\bTS_AUTHKEY\s*=\s*\S+/gu, "TS_AUTHKEY=<redacted>").replace(/tskey-[A-Za-z0-9_-]+/gu, "tskey-<redacted>").replace(/\s+/gu, " ").trim().slice(0, 180);
}

// src/setup/harness-installer.ts
var EXECUTABLES = { claude: "claude", codex: "codex" };
var MARKETPLACE = "skillloom-dev";
var PLUGIN = `skillloom@${MARKETPLACE}`;
var HarnessInstaller = class {
  constructor(processes, portable) {
    this.processes = processes;
    this.portable = portable;
  }
  processes;
  portable;
  async detect(target) {
    if (target === "agents") return true;
    return await this.processes.findExecutable(EXECUTABLES[target]) !== null;
  }
  async install(request) {
    if (request.target === "agents") return await this.installPortable(request);
    const executable = await this.processes.findExecutable(EXECUTABLES[request.target]);
    if (!executable) {
      return { target: request.target, status: "not-detected", message: "Harness was not detected" };
    }
    return request.target === "claude" ? await this.installClaude(executable, request) : await this.installCodex(executable, request);
  }
  async installClaude(executable, request) {
    const inventory = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin inventory", inventory);
    const plugin = claudePluginState(inventory.stdout, request.scope);
    if (plugin.status === "enabled" && plugin.version === request.packageVersion) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }
    if (plugin.status === "disabled") {
      const enabled = await this.processes.run(executable, ["plugin", "enable", PLUGIN, "--scope", request.scope]);
      if (enabled.exitCode !== 0) return failure(request.target, "plugin enable", enabled);
      if (plugin.version === request.packageVersion) {
        return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
      }
    }
    if (plugin.status !== "missing") {
      return await this.updateClaude(executable, request);
    }
    const registered = await this.processes.run(executable, [
      "plugin",
      "marketplace",
      "add",
      request.packageRoot,
      "--scope",
      request.scope
    ]);
    if (registered.exitCode !== 0) return failure(request.target, "marketplace registration", registered);
    const installed = await this.processes.run(executable, ["plugin", "install", PLUGIN, "--scope", request.scope]);
    if (installed.exitCode !== 0) return failure(request.target, "plugin install", installed);
    return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
  }
  async updateClaude(executable, request) {
    const marketplace = await this.processes.run(executable, ["plugin", "marketplace", "update", MARKETPLACE]);
    if (marketplace.exitCode !== 0) return failure(request.target, "marketplace update", marketplace);
    const updated = await this.processes.run(executable, ["plugin", "update", PLUGIN, "--scope", request.scope]);
    if (updated.exitCode !== 0) return failure(request.target, "plugin update", updated);
    const inventory = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin verification", inventory);
    const plugin = claudePluginState(inventory.stdout, request.scope);
    if (plugin.status !== "enabled" || plugin.version !== request.packageVersion) {
      const found = plugin.status === "missing" ? "missing" : plugin.version ?? "unknown";
      return {
        target: request.target,
        status: "failed",
        message: `Plugin update did not activate Skillloom ${request.packageVersion} (found ${found})`
      };
    }
    return { target: request.target, status: "installed", message: "Skillloom plugin updated" };
  }
  async installCodex(executable, request) {
    if (request.scope === "project") {
      return {
        target: request.target,
        status: "failed",
        message: "Codex plugins support user scope only; use --scope user or --target agents --scope project"
      };
    }
    const current = await this.processes.run(executable, ["plugin", "list", "--json"]);
    if (current.exitCode !== 0) return failure(request.target, "plugin inventory", current);
    if (codexPluginInstalled(current.stdout)) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }
    const registered = await this.processes.run(executable, [
      "plugin",
      "marketplace",
      "add",
      request.packageRoot,
      "--json"
    ]);
    if (registered.exitCode !== 0) return failure(request.target, "marketplace registration", registered);
    const inventory = await this.processes.run(executable, [
      "plugin",
      "list",
      "--marketplace",
      MARKETPLACE,
      "--available",
      "--json"
    ]);
    if (inventory.exitCode !== 0) return failure(request.target, "plugin inventory", inventory);
    if (codexPluginInstalled(inventory.stdout)) {
      return { target: request.target, status: "unchanged", message: "Skillloom plugin is already installed" };
    }
    const installed = await this.processes.run(executable, ["plugin", "add", PLUGIN, "--json"]);
    if (installed.exitCode !== 0) return failure(request.target, "plugin installation", installed);
    return { target: request.target, status: "installed", message: "Skillloom plugin installed" };
  }
  async installPortable(request) {
    if (!this.portable) {
      return { target: request.target, status: "failed", message: "Portable Agent Skills installer is unavailable" };
    }
    const status = await this.portable.install(request.packageRoot, request.destinationRoot);
    return {
      target: request.target,
      status,
      message: status === "installed" ? "Portable Agent Skills installed" : "Portable Agent Skills are already installed"
    };
  }
};
function claudePluginState(output, scope) {
  const value = JSON.parse(output);
  if (!Array.isArray(value)) throw new Error("Claude plugin inventory returned an invalid response");
  const plugin = value.find((item) => isRecord24(item) && item.id === PLUGIN && item.scope === scope);
  if (!isRecord24(plugin)) return { status: "missing" };
  return {
    status: plugin.enabled === false ? "disabled" : "enabled",
    version: typeof plugin.version === "string" ? plugin.version : void 0
  };
}
function codexPluginInstalled(output) {
  const value = JSON.parse(output);
  if (!isRecord24(value) || !Array.isArray(value.installed)) {
    throw new Error("Codex plugin inventory returned an invalid response");
  }
  return value.installed.some((item) => isRecord24(item) && item.pluginId === PLUGIN && item.installed === true);
}
function isRecord24(value) {
  return typeof value === "object" && value !== null;
}
function failure(target, step, result) {
  const detail = result.stderr.trim() || result.stdout.trim() || `exited with ${result.exitCode}`;
  return { target, status: "failed", message: `${step} failed: ${detail}` };
}

// src/setup/hub-adapter.ts
var setupHubUnavailableMessage = "Skillloom Hub became unavailable during setup registry reconcile; fix Hub connectivity and rerun setup, or rerun with --hub local for explicit local-only setup";
var HubSetupAdapter = class {
  constructor(clientVersion, tailscale, createClient = (baseUrl) => createHubHttpClient({ baseUrl }), stableApply) {
    this.clientVersion = clientVersion;
    this.tailscale = tailscale;
    this.createClient = createClient;
    this.stableApply = stableApply;
  }
  clientVersion;
  tailscale;
  createClient;
  stableApply;
  previews = /* @__PURE__ */ new Map();
  async discover(root4, hubUrl) {
    let preview;
    try {
      preview = await previewHubSession({
        root: root4,
        clientVersion: this.clientVersion,
        createClient: this.createClient,
        tailscaleStatus: this.tailscale,
        ...hubUrl === void 0 ? {} : { developmentUrl: hubUrl }
      });
    } catch (error) {
      if (error instanceof HubUnavailableError) return { mode: "local-only" };
      throw error;
    }
    const existingTrust = await readHubTrust(root4);
    if (existingTrust) verifyHubTrust(existingTrust, preview.negotiation);
    this.previews.set(root4, preview);
    return {
      mode: "connected",
      endpoint: preview.endpoint.url,
      hubInstanceId: preview.negotiation.hubInstanceId,
      signingKeyFingerprint: canonicalSigningKeyFingerprint(preview.negotiation.releaseSigningPublicKey)
    };
  }
  async trust(root4, discovery) {
    const preview = this.previews.get(root4);
    if (!preview || preview.endpoint.url !== discovery.endpoint || preview.negotiation.hubInstanceId !== discovery.hubInstanceId || canonicalSigningKeyFingerprint(preview.negotiation.releaseSigningPublicKey) !== discovery.signingKeyFingerprint) {
      throw new Error("Hub trust preview is missing or changed; run setup again");
    }
    await trustHubSession(root4, preview, { explicit: true, trustedAt: (/* @__PURE__ */ new Date()).toISOString() });
    this.previews.delete(root4);
    return { trusted: true };
  }
  async verifyBrainRead(root4) {
    const session = await this.openSession(root4);
    if (session.mode === "local-only") throw new Error("Skillloom Hub is offline");
    await createBrainApi(root4, session.client).search({ query: "skillloom-setup-read-probe", limit: 1 });
    return { verified: true };
  }
  async reconcile({ root: root4, apply, strictInitial }) {
    const session = await this.openSession(root4);
    if (session.mode === "local-only") {
      if (strictInitial) throw new UsageError(setupHubUnavailableMessage);
      return { applied: false, pulled: 0, imported: 0, conflicts: ["Hub is offline"] };
    }
    if (apply) await drainPendingHubMutations(root4, session.client);
    const [trust, config] = await Promise.all([readHubTrust(root4), ensureConfig(root4)]);
    const reconciled = await reconcileHubReleases({
      root: root4,
      remote: createRegistryRemotePort(session.client),
      trust,
      hub: {
        hubInstanceId: session.negotiation.hubInstanceId,
        releaseSigningPublicKey: session.negotiation.releaseSigningPublicKey
      },
      allowedCapabilities: config.policy.allowedCapabilities ?? [],
      ...apply && this.stableApply ? { apply: this.stableApply } : {}
    });
    if (strictInitial && reconciled.mode === "offline") throw new UsageError(setupHubUnavailableMessage);
    return {
      applied: apply,
      pulled: reconciled.imported,
      imported: reconciled.imported,
      conflicts: reconciled.mode === "offline" ? ["Hub is offline"] : []
    };
  }
  async openSession(root4) {
    return await openHubSession({
      root: root4,
      clientVersion: this.clientVersion,
      createClient: this.createClient,
      tailscaleStatus: this.tailscale
    });
  }
};
async function openDefaultHubSession(root4, clientVersion, tailscale) {
  const session = await openSession(root4, clientVersion, tailscale);
  if (session.mode === "local-only") throw new Error("Skillloom Hub is offline");
  return session;
}
async function openSession(root4, clientVersion, tailscale) {
  return await openHubSession({
    root: root4,
    clientVersion,
    createClient: (baseUrl) => createHubHttpClient({ baseUrl }),
    tailscaleStatus: tailscale
  });
}

// src/setup/package-root.ts
import { existsSync } from "node:fs";
import { dirname as dirname17, resolve as resolve9 } from "node:path";
import { fileURLToPath } from "node:url";
function resolvePackageRoot(moduleUrl = import.meta.url) {
  const moduleDirectory = dirname17(fileURLToPath(moduleUrl));
  const candidates = [resolve9(moduleDirectory, ".."), resolve9(moduleDirectory, "../..")];
  const packageRoot = candidates.find((candidate2) => existsSync(resolve9(candidate2, "package.json")));
  if (!packageRoot) throw new Error("Skillloom package root is missing");
  return packageRoot;
}

// src/setup/portable-skills.ts
import { cp, mkdir as mkdir21, readdir as readdir10, readFile as readFile18, rename as rename7, rm as rm14, stat as stat4 } from "node:fs/promises";
import { createHash as createHash14, randomUUID as randomUUID9 } from "node:crypto";
import { dirname as dirname18, join as join34 } from "node:path";
var PortableSkillInstaller = class {
  async install(packageRoot, destinationRoot) {
    const source = join34(packageRoot, "skills");
    const destinationRootPath = join34(destinationRoot, ".agents", "skills");
    await mkdir21(destinationRootPath, { recursive: true });
    let changed = false;
    for (const entry of await readdir10(source, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceSkill = join34(source, entry.name);
      const destinationSkill = join34(destinationRootPath, entry.name);
      if (await treeHash(sourceSkill) === await optionalTreeHash(destinationSkill)) continue;
      await replaceTree(sourceSkill, destinationSkill);
      changed = true;
    }
    return changed ? "installed" : "unchanged";
  }
};
async function replaceTree(source, destination) {
  const staging = join34(dirname18(destination), `.${randomUUID9()}.staging`);
  const backup = join34(dirname18(destination), `.${randomUUID9()}.backup`);
  try {
    await cp(source, staging, { recursive: true, force: false });
    const hadDestination = await exists(destination);
    if (hadDestination) await rename7(destination, backup);
    try {
      await rename7(staging, destination);
    } catch (error) {
      if (hadDestination) await rename7(backup, destination);
      throw error;
    }
    await rm14(backup, { recursive: true, force: true });
  } finally {
    await rm14(staging, { recursive: true, force: true });
  }
}
async function exists(path) {
  try {
    await stat4(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
async function optionalTreeHash(root4) {
  try {
    return await treeHash(root4);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
async function treeHash(root4) {
  const hash2 = createHash14("sha256");
  for (const relativePath of await listFiles(root4)) {
    hash2.update(relativePath);
    hash2.update(await readFile18(join34(root4, relativePath)));
  }
  return hash2.digest("hex");
}
async function listFiles(root4, prefix = "") {
  const paths = [];
  for (const entry of await readdir10(join34(root4, prefix), { withFileTypes: true })) {
    const relativePath = join34(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await listFiles(root4, relativePath));
    else if (entry.isFile()) paths.push(relativePath);
  }
  return paths.sort();
}

// src/setup/process.ts
import { execFile } from "node:child_process";
import { constants as constants3 } from "node:fs";
import { access as access5 } from "node:fs/promises";
import { delimiter as delimiter3, join as join35 } from "node:path";
import { promisify } from "node:util";
var execute = promisify(execFile);
var platformFallbacks = process.platform === "darwin" ? { tailscale: ["/Applications/Tailscale.app/Contents/MacOS/Tailscale"] } : {};
var SystemProcessPort = class {
  constructor(searchPath = process.env.PATH ?? "", fallbacks = platformFallbacks) {
    this.searchPath = searchPath;
    this.fallbacks = fallbacks;
  }
  searchPath;
  fallbacks;
  async findExecutable(name) {
    const candidates = [
      ...this.searchPath.split(delimiter3).filter(Boolean).map((directory) => join35(directory, name)),
      ...this.fallbacks[name] ?? []
    ];
    for (const path of candidates) {
      try {
        await access5(path, constants3.X_OK);
        return path;
      } catch {
      }
    }
    return null;
  }
  async run(executable, args, environment, timeoutMs) {
    try {
      const { stdout, stderr } = await execute(executable, args, {
        shell: false,
        ...environment ? { env: environment } : {},
        ...timeoutMs === void 0 ? {} : { timeout: timeoutMs }
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
};

// src/setup/state.ts
import { mkdir as mkdir22, readFile as readFile19 } from "node:fs/promises";
import { join as join36 } from "node:path";
async function readSetupState(root4) {
  try {
    return parseState(JSON.parse(await readFile19(statePath(root4), "utf8")));
  } catch (error) {
    if (isMissing6(error)) return { version: 1, completed: {} };
    throw error;
  }
}
async function checkpointSetupTarget(root4, state, target, scope, packageVersion) {
  state.completed[completionKey(target, scope)] = { packageVersion, completedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await mkdir22(root4, { recursive: true });
  await atomicWriteJson(statePath(root4), state, { mode: 384 });
}
function isSetupTargetCurrent(state, target, scope, packageVersion) {
  return state.completed[completionKey(target, scope)]?.packageVersion === packageVersion;
}
function statePath(root4) {
  return join36(root4, "setup.json");
}
function completionKey(target, scope) {
  return `${target}:${scope}`;
}
function parseState(value) {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("completed" in value) || typeof value.completed !== "object" || value.completed === null) {
    throw new Error("Invalid setup state");
  }
  const completed = {};
  for (const [key, item] of Object.entries(value.completed)) {
    if (typeof item !== "object" || item === null || !("packageVersion" in item) || typeof item.packageVersion !== "string" || !("completedAt" in item) || typeof item.completedAt !== "string") {
      throw new Error("Invalid setup state completion");
    }
    completed[key] = { packageVersion: item.packageVersion, completedAt: item.completedAt };
  }
  return { version: 1, completed };
}
function isMissing6(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// src/setup/surfaces.ts
function resolveSetupSurfaces(discovery) {
  if (discovery.mode === "local-only") return null;
  const hub = new URL(discovery.endpoint);
  const obsidian = new URL(hub.origin);
  obsidian.port = "8443";
  return {
    hub: { url: hub.origin, externalPort: 443 },
    obsidian: {
      url: obsidian.origin,
      externalPort: 8443,
      internalPort: 3e3,
      workspaces: {
        library: { path: "Library", access: "read-only" },
        dashboards: { path: "Bases", access: "writable-ui-state" },
        authoring: { path: "Authoring", access: "writable-staging" }
      }
    }
  };
}

// src/setup/service.ts
var AUTO_TARGETS = ["claude", "codex", "agents"];
var SetupService = class {
  constructor(hub, installer, consent, options, environment, guidance, host) {
    this.hub = hub;
    this.installer = installer;
    this.consent = consent;
    this.options = options;
    this.environment = environment;
    this.guidance = guidance;
    this.host = host;
  }
  hub;
  installer;
  consent;
  options;
  environment;
  guidance;
  host;
  async setup(request) {
    const root4 = this.options.root ?? this.options.stateRoot;
    const plan = await this.plan(request);
    if (plan?.role === "role-required") {
      throw new UsageError("Choose setup role: --role main-hub, --role client-node, or --role local-only with --hub local");
    }
    if (plan?.status === "blocked") {
      throw new UsageError(`Setup plan is blocked: ${plan.warnings.join(" ")}`);
    }
    if (request.role === "main-hub") {
      await this.requireMainHubConsent(request);
      const host = await this.installHost();
      const discovery2 = await this.hub.discover(root4, host.surfaces.hub.url);
      if (discovery2.mode === "local-only") {
        throw new UsageError("Main Hub started but its private HTTPS endpoint was not reachable; local integrations were not installed");
      }
      const reconciled = await this.trustAndVerifyHub(root4, discovery2);
      const targets2 = await this.installTargets(request);
      return { command: "setup", hub: discovery2, host, surfaces: host.surfaces, targets: targets2, reconciled, ...plan ? { plan } : {} };
    }
    const discovery = request.hub === "local" ? { mode: "local-only" } : await this.hub.discover(root4, request.hubUrl);
    if (request.hub === "auto" && discovery.mode === "local-only") {
      throw new UsageError("Skillloom Hub was not reachable; rerun with --hub local for explicit local-only setup");
    }
    await this.requireConsent(request, discovery);
    if (discovery.mode === "connected") {
      const reconciled = await this.trustAndVerifyHub(root4, discovery);
      const targets2 = await this.installTargets(request);
      return { command: "setup", hub: discovery, host: null, surfaces: resolveSetupSurfaces(discovery), targets: targets2, reconciled, ...plan ? { plan } : {} };
    }
    const targets = await this.installTargets(request);
    return { command: "setup", hub: discovery, host: null, surfaces: null, targets, reconciled: null, ...plan ? { plan } : {} };
  }
  async sync(apply) {
    return { command: "sync", ...await this.hub.reconcile({ root: this.options.root ?? this.options.stateRoot, apply }) };
  }
  async requireConsent(request, discovery) {
    if (request.yes) return;
    if (!this.consent.interactive) {
      throw new UsageError("Non-interactive setup requires --yes to trust the discovered Hub and install local integrations");
    }
    const destination = discovery.mode === "connected" ? discovery.endpoint : "local-only mode";
    if (!await this.consent.confirm(`Trust ${destination} and install Skillloom for this ${request.scope}?`)) {
      throw new UsageError("Setup declined; no trust or installation changes were made");
    }
  }
  async requireMainHubConsent(request) {
    if (request.yes) return;
    if (!this.consent.interactive) {
      throw new UsageError("Non-interactive Main Hub setup requires --yes to start Docker, configure private Tailscale Serve, and install local integrations");
    }
    const accepted = await this.consent.confirm(`Start the private Docker Hub and Obsidian Web UI with a read-only Library and writable Authoring workspace, configure private Tailscale Serve, and install Skillloom for this ${request.scope}?`);
    if (!accepted) throw new UsageError("Main Hub setup declined; no host or installation changes were made");
  }
  async installHost() {
    if (!this.host) throw new UsageError("Main Hub setup requires a host installer port");
    const result = await this.host.install(true);
    if (result.status !== "running" || !result.surfaces) {
      throw new UsageError("Main Hub host install did not produce running Hub and Obsidian surfaces; local integrations were not installed");
    }
    return { ...result, status: "running", surfaces: result.surfaces };
  }
  async trustAndVerifyHub(root4, discovery) {
    await this.hub.trust(root4, discovery);
    await this.hub.verifyBrainRead(root4);
    return await this.hub.reconcile({ root: root4, apply: true, strictInitial: true });
  }
  async installTargets(request) {
    const state = await readSetupState(this.options.stateRoot);
    const selected = request.target === "auto" ? AUTO_TARGETS : [request.target];
    const results = [];
    for (const target of selected) {
      let detected;
      try {
        detected = await this.installer.detect(target);
      } catch (error) {
        results.push({ target, status: "failed", message: errorMessage7(error) });
        continue;
      }
      if (!detected) {
        results.push({ target, status: "not-detected", message: "Harness was not detected" });
        continue;
      }
      if (isSetupTargetCurrent(state, target, request.scope, this.options.packageVersion)) {
        results.push({ target, status: "unchanged", message: "Current Skillloom package is already installed" });
        continue;
      }
      let result;
      try {
        result = await this.installer.install({
          target,
          scope: request.scope,
          packageVersion: this.options.packageVersion,
          packageRoot: this.options.packageRoot,
          destinationRoot: this.options.root ?? this.options.stateRoot
        });
      } catch (error) {
        result = { target, status: "failed", message: errorMessage7(error) };
      }
      results.push(result);
      if (result.status === "installed" || result.status === "unchanged") {
        await checkpointSetupTarget(this.options.stateRoot, state, target, request.scope, this.options.packageVersion);
      }
    }
    return results;
  }
  async plan(request) {
    if (!this.environment || !this.guidance) return void 0;
    return await this.guidance.plan(request, await this.environment.detect());
  }
};
function errorMessage7(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/setup/role-plan.ts
var SetupRolePlanner = class {
  constructor(sources) {
    this.sources = sources;
  }
  sources;
  async plan(request, environment) {
    const role = resolveSetupRole(request);
    const sources = await this.sources.collect();
    const steps = role === null ? roleSelectionSteps() : stepsFor(role, request, environment, sources);
    const warnings = warningsFor(role, environment, sources);
    assertSafeSetupStepCommands(steps);
    return {
      role: role ?? "role-required",
      status: statusFor(steps, warnings),
      environment,
      sources,
      steps,
      checkpoints: role === null ? ["environment-detected", "dynamic-guidance-sourced"] : checkpointsFor(role),
      warnings
    };
  }
};
function resolveSetupRole(request) {
  if (request.role) return request.role;
  if (request.hub === "local") return "local-only";
  if (request.hubUrl) return "client-node";
  return null;
}
function assertSafeSetupStepCommands(steps) {
  for (const step of steps) {
    if (!step.command) continue;
    if (/\bfunnel\b/iu.test(step.command)) throw new Error("Setup plan must not use Tailscale Funnel");
    if (/\bTS_AUTHKEY\b/u.test(step.command)) throw new Error("Setup plan must not print or request secret-bearing auth keys");
  }
}
function roleSelectionSteps() {
  return [{
    id: "choose-setup-role",
    title: "Choose whether this machine is Main Hub, Client Node, or This Machine Only",
    action: "human",
    verification: "Setup is rerun with --role main-hub, --role client-node, or --role local-only plus --hub local."
  }];
}
function stepsFor(role, request, environment, sources) {
  if (role === "local-only") {
    return [
      {
        id: "install-plugin-integrations",
        title: "Install local Claude Code, Codex, and portable agent integrations",
        action: "automatic",
        verification: "Setup target checkpoints record installed or unchanged harness integrations."
      }
    ];
  }
  if (role === "client-node") return clientSteps(request, environment, sources);
  return mainHubSteps(environment, sources);
}
function clientSteps(request, environment, sources) {
  const tailscaleSources = sourceTitles(sources, /tailscale|serve|service/iu);
  return [
    ...environment.tailscale === "authenticated" ? [] : [{
      id: "tailscale-login",
      title: "Sign in to Tailscale on this device",
      action: "human",
      verification: "tailscale status --json returns the current tailnet identity.",
      sourceTitles: tailscaleSources
    }],
    {
      id: "trust-hub",
      title: request.hubUrl ? "Trust the supplied credential-free Hub URL" : "Discover and trust the private Skillloom Hub",
      action: "human",
      verification: "Hub hello, Brain read verification, registry reconcile, and signing-key pin all succeed before local installation.",
      sourceTitles: tailscaleSources
    },
    {
      id: "install-plugin-integrations",
      title: "Install local Claude Code, Codex, and portable agent integrations",
      action: "automatic",
      verification: "Setup target checkpoints record installed or unchanged harness integrations."
    }
  ];
}
function mainHubSteps(environment, sources) {
  const tailscaleSources = sourceTitles(sources, /tailscale|serve|service/iu);
  const dockerSources = sourceTitles(sources, /docker|compose/iu);
  return [
    ...environment.tailscale === "authenticated" ? [] : [{
      id: "tailscale-login",
      title: "Sign in to Tailscale before exposing the Hub to the tailnet",
      action: "human",
      verification: "tailscale status --json returns the Hub host identity.",
      sourceTitles: tailscaleSources
    }],
    ...environment.docker === "available" ? [] : [{
      id: "install-docker-compose",
      title: "Install Docker with Compose v2",
      action: "human",
      verification: "docker compose version exits successfully.",
      sourceTitles: dockerSources
    }],
    {
      id: "start-private-stack",
      title: "Start the private Hub and Obsidian Web UI with a read-only Library and writable Authoring workspace",
      action: "automatic",
      command: "skillloom host install --yes",
      verification: "Docker reports skillloom-hub and obsidian running with Library read-only, Bases writable-ui-state, and Authoring writable-staging, then Tailscale Serve publishes only tailnet HTTPS surfaces."
    },
    {
      id: "verify-tailnet-access",
      title: "Verify the printed private Serve URLs from another tailnet device",
      action: "automatic",
      verification: "skillloom host status prints Hub on HTTPS 443 and Obsidian on HTTPS 8443 for the host MagicDNS name.",
      sourceTitles: tailscaleSources
    }
  ];
}
function warningsFor(role, environment, sources) {
  const warnings = [
    ...role === null ? ["Setup role is ambiguous; choose Main Hub, Client Node, or This Machine Only before any setup side effects."] : [],
    ...role !== "local-only" && sources.length === 0 ? ["Dynamic official docs and local CLI help were unavailable; setup must not guess changing external steps."] : [],
    "Tailscale Funnel is not part of Skillloom setup; use private Tailscale Serve only.",
    "Secret-bearing values such as TS_AUTHKEY must stay in the local environment and never be pasted into chat."
  ];
  if (role === "main-hub" && environment.tailscale !== "authenticated") warnings.push("Main Hub setup needs a human Tailscale login or an explicit advanced headless auth-key workflow.");
  if (role !== null && externalSourceMissing(role, sources)) warnings.push("Dynamic guidance is missing required official or CLI evidence for one or more external setup steps.");
  return warnings;
}
function externalSourceMissing(role, sources) {
  if (role === "local-only") return false;
  const hasTailscale = sourceTitles(sources, /tailscale|serve|service/iu).length > 0;
  const hasDocker = role === "main-hub" ? sourceTitles(sources, /docker|compose/iu).length > 0 : true;
  return !hasTailscale || !hasDocker;
}
function sourceTitles(sources, pattern) {
  return sources.filter((source) => pattern.test(`${source.title}
${source.snippets.join("\n")}`)).map((source) => source.title);
}
function checkpointsFor(role) {
  return role === "main-hub" ? ["environment-detected", "dynamic-guidance-sourced", "host-state-prepared", "stack-started", "serve-verified"] : ["environment-detected", "dynamic-guidance-sourced", "hub-trusted", "brain-read-verified", "integrations-installed"];
}
function statusFor(steps, warnings) {
  if (warnings.some((warning) => warning.startsWith("Dynamic official docs") || warning.startsWith("Setup role") || warning.startsWith("Dynamic guidance is missing"))) return "blocked";
  return steps.some((step) => step.action === "human") ? "needs-human" : "ready";
}

// src/setup/tailscale-process.ts
var TailscaleProcessAdapter = class {
  constructor(processes) {
    this.processes = processes;
  }
  processes;
  async run(_executable, args) {
    const executable = await this.processes.findExecutable("tailscale");
    if (!executable) return { exitCode: 127, stdout: "", stderr: "tailscale executable not found" };
    return await this.processes.run(executable, [...args]);
  }
};

// src/setup/stable-apply.ts
import { homedir as homedir3 } from "node:os";
var StableReleaseInstaller = class {
  constructor(scope, homeDir = homedir3()) {
    this.scope = scope;
    this.homeDir = homeDir;
  }
  scope;
  homeDir;
  async applyStableRelease(input) {
    const config = await ensureConfig(input.root);
    await promoteCandidate(
      { projectRoot: input.root, homeDir: this.homeDir },
      input.candidate.candidateId,
      config.policy.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: this.scope })),
      { yes: true, acceptWarnings: config.policy.allowWarnings }
    );
  }
};

// src/setup/defaults.ts
async function createDefaultSetupService(scope) {
  const root4 = scope === "user" ? homedir4() : process.cwd();
  return await createSetupService(root4, scope);
}
async function createDefaultSyncService() {
  const root4 = await resolveTrustedRoot();
  return await createSetupService(root4, root4 === homedir4() ? "user" : "project");
}
async function createSetupService(root4, scope) {
  const packageRoot = resolvePackageRoot();
  const packageVersion = await readPackageVersion(packageRoot);
  const processes = new SystemProcessPort();
  const guidanceSources = new DynamicSetupGuidanceSources(processes);
  return new SetupService(
    new HubSetupAdapter(
      packageVersion,
      new TailscaleProcessAdapter(processes),
      (baseUrl) => createHubHttpClient({ baseUrl }),
      new StableReleaseInstaller(scope)
    ),
    new HarnessInstaller(processes, new PortableSkillInstaller()),
    new TerminalConsentPort(),
    { root: root4, stateRoot: join37(root4, ".skillloom", "hub"), packageRoot, packageVersion },
    new SetupEnvironmentDetector(processes),
    new SetupRolePlanner(guidanceSources),
    new HostService(
      { processes, consent: new TerminalConsentPort() },
      { packageRoot, hostRoot: join37(root4, ".skillloom", "host"), env: process.env }
    )
  );
}
async function createDefaultBridgeOptions() {
  const packageVersion = await readPackageVersion(resolvePackageRoot());
  const root4 = await resolveTrustedRoot();
  const tailscale = new TailscaleProcessAdapter(new SystemProcessPort());
  const setup = await createSetupService(root4, root4 === homedir4() ? "user" : "project");
  return {
    remote: new LazyHubApiBridgeAdapter(async () => {
      const session = await openDefaultHubSession(root4, packageVersion, tailscale);
      const trust = await readHubTrust(root4);
      return {
        brain: createBrainApi(root4, session.client),
        registry: {
          ...createRegistryMutationApi(root4, session.client),
          ...createRegistryReadApi({
            remote: createRegistryRemotePort(session.client),
            trust,
            hub: {
              hubInstanceId: session.negotiation.hubInstanceId,
              releaseSigningPublicKey: session.negotiation.releaseSigningPublicKey
            }
          })
        }
      };
    }),
    sync: {
      async syncOnce(signal) {
        if (signal.aborted) throw signal.reason;
        await setup.sync(true);
      }
    }
  };
}
async function resolveTrustedRoot() {
  const projectRoot = process.cwd();
  if (await readHubTrust(projectRoot)) return projectRoot;
  const userRoot = homedir4();
  if (await readHubTrust(userRoot)) return userRoot;
  return userRoot;
}
async function readPackageVersion(packageRoot) {
  const value = JSON.parse(await readFile20(join37(packageRoot, "package.json"), "utf8"));
  if (typeof value !== "object" || value === null || !("version" in value) || typeof value.version !== "string") {
    throw new Error("Skillloom package version is missing");
  }
  return value.version;
}

// src/commands/bridge.ts
async function bridgeCommand(options) {
  await runBridgeStdio(options ?? await createDefaultBridgeOptions());
}

// src/commands/setup.ts
async function setupCommand(command, service) {
  const setup = service ?? await createDefaultSetupService(command.scope);
  return await setup.setup({
    target: command.target,
    hub: command.hub,
    ...command.hubUrl === void 0 ? {} : { hubUrl: command.hubUrl },
    scope: command.scope,
    yes: command.yes,
    ...command.role === void 0 ? {} : { role: command.role }
  });
}

// src/commands/sync.ts
async function syncCommand(command, service) {
  return await (service ?? await createDefaultSyncService()).sync(command.apply);
}

// src/host/defaults.ts
import { homedir as homedir5 } from "node:os";
import { join as join38 } from "node:path";
function createDefaultHostService() {
  return new HostService(
    { processes: new SystemProcessPort(), consent: new TerminalConsentPort() },
    { packageRoot: resolvePackageRoot(), hostRoot: join38(homedir5(), ".skillloom", "host"), env: process.env }
  );
}

// src/commands/host.ts
async function hostCommand(command, service) {
  const host = service ?? createDefaultHostService();
  return command.action === "install" ? await host.install(command.yes) : await host.status();
}

// src/demo/service.ts
import { mkdir as mkdir24, mkdtemp as mkdtemp3, rm as rm16 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join42 } from "node:path";
import { performance } from "node:perf_hooks";

// src/hub/runtime/auth-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
var storage = new AsyncLocalStorage();
async function runWithHubAuthorizationContext(authorization, fn) {
  return await storage.run(authorization, fn);
}
function currentHubAuthorizationContext() {
  return storage.getStore();
}

// src/hub/runtime/permissions.ts
var OBSIDIAN_AUTHORING_ACTOR_ID = "local:obsidian-authoring";
function createRuntimeBrainPermissions() {
  return {
    async requireRead(actor) {
      if (isInProcessAuthoringActor(actor.actorId)) return;
      requireActorPermission(actor.actorId, "brain:read");
    },
    async requireWrite(actor, action) {
      if (isInProcessAuthoringActor(actor.actorId) && (action === "capture" || action === "update")) return;
      requireActorPermission(actor.actorId, `brain:${action}`);
    }
  };
}
function isInProcessAuthoringActor(actorId) {
  return actorId === OBSIDIAN_AUTHORING_ACTOR_ID && currentHubAuthorizationContext() === void 0;
}
function requireActorPermission(actorId, permission) {
  const authorization = currentHubAuthorizationContext();
  if (authorization === void 0) throw new HubAuthorizationError(`Actor ${actorId} is not authorized`);
  if (authorization.principal.actorId !== actorId) throw new HubAuthorizationError(`Actor ${actorId} is not authorized for this request`);
  authorization.require(permission);
}

// src/evaluation/brain-runtime.ts
async function createEvaluationBrainRuntime(root4, actorIds) {
  const authorization = createHubAuthorizationService({
    actorRoles: Object.fromEntries(actorIds.map((actorId) => [actorId, ["contributor"]])),
    capabilityNamespaces: ["skillloom.local/cap/evaluation"]
  });
  const contexts = new Map(actorIds.map((actorId) => [
    actorId,
    authorization.authorize({ actorId, kind: "user", appCapabilities: [] })
  ]));
  const brain = await createBrainService({ root: root4, permissions: createRuntimeBrainPermissions() });
  return {
    brain,
    actor(actorId) {
      requireContext(contexts, actorId);
      return { actorId };
    },
    async runAs(actorId, fn) {
      return await runWithHubAuthorizationContext(requireContext(contexts, actorId), fn);
    },
    async close() {
      await brain.close();
    }
  };
}
function requireContext(contexts, actorId) {
  const context = contexts.get(actorId);
  if (context === void 0) throw new Error(`Evaluation actor is not configured: ${actorId}`);
  return context;
}

// src/demo/checks.ts
import { access as access6 } from "node:fs/promises";
import { join as join41 } from "node:path";

// src/learning/workflow-governance.ts
import { createHash as createHash15 } from "node:crypto";
import { rm as rm15 } from "node:fs/promises";
import { dirname as dirname19, join as join40 } from "node:path";

// src/learning/workflow-governance-package.ts
import { cp as cp2, mkdir as mkdir23, readFile as readFile21, writeFile as writeFile4 } from "node:fs/promises";
import { basename as basename10, join as join39 } from "node:path";
var maxSteps = 8;
var maxStepLength = 240;
async function writeWorkflowSkillPackage(root4, operationId, workflow, action, baseSkillPath) {
  const name = action === "patch" && baseSkillPath !== void 0 ? basename10(baseSkillPath) : skillName(workflow.title);
  const packageRoot = join39(root4, ".skillloom", "staging", `workflow-${safeFragment(operationId)}`, name);
  await mkdir23(packageRoot, { recursive: true });
  if (action === "patch" && baseSkillPath !== void 0) {
    await cp2(baseSkillPath, packageRoot, { recursive: true });
  }
  const content = action === "patch" && baseSkillPath !== void 0 ? await patchedSkillText(baseSkillPath, workflow) : createdSkillText(name, workflow);
  await writeFile4(join39(packageRoot, "SKILL.md"), content);
  return packageRoot;
}
function boundedWorkflowSteps(workflow) {
  if (workflow.details.kind !== "workflow") return [];
  return workflow.details.steps.slice(0, maxSteps).map((step) => step.trim().replace(/\s+/gu, " ").slice(0, maxStepLength)).filter((step) => step.length > 0);
}
function createdSkillText(name, workflow) {
  return [
    "---",
    `name: ${name}`,
    `description: ${cleanDescription(workflow.title)}`,
    "---",
    "",
    `Use when ${cleanSentence(workflow.details.kind === "workflow" ? workflow.details.trigger : workflow.title)}.`,
    "",
    ...boundedWorkflowSteps(workflow).map((step, index) => `${index + 1}. ${step}`),
    ""
  ].join("\n");
}
async function patchedSkillText(baseSkillPath, workflow) {
  const base = await readFile21(join39(baseSkillPath, "SKILL.md"), "utf8");
  return [
    base.trimEnd(),
    "",
    "## Proven Workflow Update",
    "",
    `Use when ${cleanSentence(workflow.details.kind === "workflow" ? workflow.details.trigger : workflow.title)}.`,
    "",
    ...boundedWorkflowSteps(workflow).map((step, index) => `${index + 1}. ${step}`),
    ""
  ].join("\n");
}
function skillName(value) {
  return safeFragment(value).slice(0, 48) || "workflow-skill";
}
function safeFragment(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
}
function cleanDescription(value) {
  const cleaned = value.trim().replace(/\s+/gu, " ").slice(0, 120);
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}
function cleanSentence(value) {
  return value.trim().replace(/\s+/gu, " ").slice(0, 180).replace(/[.]+$/u, "");
}

// src/learning/workflow-governance.ts
async function governWorkflowUpdate(input) {
  await ensureConfig(input.projectRoot);
  const actor = { actorId: input.actorId };
  const workflow = await input.brain.read({ actor, artifactId: input.workflowArtifactId });
  if (workflow.type !== "workflow" || workflow.details.kind !== "workflow") {
    throw new ValidationError("Governed workflow update requires a Brain workflow artifact");
  }
  if (input.action === "patch" && input.baseSkillPath === void 0) {
    return await reject(input, workflow, "patch workflow update requires a base skill path", false);
  }
  if (input.action === "create" && input.baseSkillPath !== void 0) {
    return await reject(input, workflow, "create workflow update cannot include a base skill path", false);
  }
  if (boundedWorkflowSteps(workflow).length === 0) {
    return await reject(input, workflow, "workflow has no bounded executable steps", false);
  }
  if (input.proof === void 0) {
    return { status: "draft", reason: "reliable verifier proof is missing", workflow };
  }
  const proofError = verifierError(input.proof, workflow);
  if (proofError !== null) {
    return await reject(input, workflow, proofError, input.proof.status !== "passed");
  }
  const candidate2 = await captureImmutableCandidate(input, workflow);
  if (input.promote === void 0) {
    return { status: "candidate", workflow, candidate: candidate2 };
  }
  const validation = await validateSkillPackage(join40(input.projectRoot, ".skillloom", "candidates", candidate2.candidateId, "skill"), {
    expectedName: candidate2.metadata.name,
    expectedHash: candidate2.packageHash
  });
  const config = await ensureConfig(input.projectRoot);
  const policy = evaluateAutoPromotion(config, {
    candidateId: candidate2.candidateId,
    packageHash: validation.packageHash,
    targets: [...input.promote.targets],
    scopes: input.promote.targets.map(() => input.promote?.scope ?? "project"),
    files: validation.files,
    warnings: validation.findings.filter((finding2) => finding2.severity === "warning").length,
    dangers: validation.findings.filter((finding2) => finding2.severity === "danger").length,
    capabilities: validation.metadata.capabilities ?? []
  });
  if (!policy.approved) {
    return await reject(input, workflow, `policy rejected workflow promotion: ${policy.reasons.join("; ")}`, true);
  }
  const promotion = await promoteCandidate(
    { projectRoot: input.projectRoot, homeDir: input.homeDir },
    candidate2.candidateId,
    input.promote.targets.map((target) => ({ adapter: getScopedAdapter(target), scope: input.promote?.scope ?? "project" })),
    { kind: "policy", workflowProof: candidate2.governedWorkflowProof }
  );
  return { status: "promoted", workflow, candidate: candidate2, promotion };
}
async function captureImmutableCandidate(input, workflow) {
  const operationId = `op-workflow-${stableUuid2(input.operationId)}`;
  return await withStoreLock(input.projectRoot, async () => {
    const packageRoot = await writeWorkflowSkillPackage(input.projectRoot, input.operationId, workflow, input.action, input.baseSkillPath);
    let snapshot;
    try {
      snapshot = await stageCandidateSnapshot(input.projectRoot, operationId, packageRoot);
      const validation = await validateSkillPackage(snapshot.skillRoot, { folderNamePolicy: "match-metadata" });
      const createdAt = stableTimestamp(workflow.updatedAt, input.operationId);
      const candidateId = createCandidateId(createdAt, validation.packageHash);
      const existing = await readCandidate(input.projectRoot, candidateId).catch(() => null);
      if (existing !== null) {
        await discardCandidateSnapshot(snapshot);
        return existing;
      }
      const record = {
        candidateId,
        operationId,
        state: stateForFindings(validation.findings),
        metadata: validation.metadata,
        packageHash: validation.packageHash,
        createdAt,
        createdBy: "agent",
        evidence: [`workflow:${workflow.id}@${workflow.revision}`, `proof:${input.proof?.kind ?? "missing"}`],
        findings: validation.findings,
        base: await baseFor(input),
        governedWorkflowProof: proofDecision(input, workflow, candidateId, validation.packageHash)
      };
      await commitCandidateSnapshot(input.projectRoot, record, snapshot);
      snapshot = void 0;
      await appendEvent(input.projectRoot, { operationId, kind: "capture", phase: "snapshotted", evidence: { candidateId, workflowArtifactId: workflow.id } });
      return record;
    } finally {
      if (snapshot !== void 0) await discardCandidateSnapshot(snapshot).catch(() => void 0);
      await rm15(packageRoot, { recursive: true, force: true });
      await rm15(dirname19(packageRoot), { recursive: true, force: true });
    }
  }, { operationId, context: "workflow-governance" });
}
async function reject(input, workflow, reason, retryable) {
  const actor = { actorId: input.actorId };
  const rejected = await input.brain.capture({
    actor,
    requestId: `workflow-governance:rejected:${stableUuid2(`${input.operationId}:${workflow.id}:${workflow.revision}:${reason}`)}`,
    type: "rejected-update",
    title: `Rejected workflow update: ${workflow.title}`,
    content: workflow.content,
    provenance: {
      source: "skillloom-workflow-governance",
      workflowArtifactId: workflow.id,
      workflowRevision: workflow.revision,
      workflowContentHash: workflow.contentHash,
      operationId: input.operationId,
      reason
    },
    details: { kind: "rejected-update", targetArtifactId: workflow.id, rejectedAt: stableTimestamp(workflow.updatedAt, input.operationId), reason, retryable },
    sensitivity: workflow.sensitivity
  });
  await input.brain.capture({
    actor,
    requestId: `workflow-governance:feedback:${stableUuid2(`${input.operationId}:${workflow.id}:${reason}`)}`,
    type: "feedback",
    title: `Workflow governance feedback: ${workflow.title}`,
    content: reason,
    provenance: {
      source: "skillloom-workflow-governance",
      workflowArtifactId: workflow.id,
      rejectedUpdateId: rejected.artifact.id
    },
    details: { kind: "feedback", targetArtifactId: workflow.id, signal: "negative", reason },
    sensitivity: workflow.sensitivity
  });
  await writeLearningEvent(input.projectRoot, {
    source: "codex",
    outcome: "memory",
    summary: `Rejected workflow update: ${reason}`,
    episode: {
      taskId: input.operationId,
      host: "codex",
      outcome: "failure",
      evidence: [{ category: "mcp", summary: `workflow:${workflow.id}` }],
      verifierSignals: [{ kind: "review", status: "failed", summary: reason }]
    }
  });
  return { status: "rejected", reason, workflow, rejectedUpdateId: rejected.artifact.id };
}
function verifierError(proof, workflow) {
  if (proof.status !== "passed") return `verifier ${proof.kind} failed: ${proof.summary}`;
  if (proof.workflow.artifactId !== workflow.id || proof.workflow.revision !== workflow.revision || proof.workflow.contentHash !== workflow.contentHash) {
    return "verifier proof is not bound to the workflow artifact";
  }
  const hashes = provenanceHashes(workflow);
  if (hashes.length > 0 && !hashes.every((hash2) => proof.provenanceHashes.includes(hash2))) {
    return "verifier proof is not bound to workflow episode provenance";
  }
  if (proof.kind === "held-out-evaluation" && proof.score < proof.threshold) {
    return `held-out evaluation score ${proof.score} is below ${proof.threshold}`;
  }
  return null;
}
function provenanceHashes(workflow) {
  const hashes = workflow.provenance.provenanceHashes;
  if (!Array.isArray(hashes)) return [];
  const values = [];
  for (const hash2 of hashes) {
    if (typeof hash2 === "string" && /^sha256:[0-9a-f]{64}$/u.test(hash2)) values.push(hash2);
  }
  return values;
}
async function baseFor(input) {
  if (input.action !== "patch" || input.baseSkillPath === void 0) return { kind: "none" };
  const validation = await validateSkillPackage(input.baseSkillPath);
  return { kind: "installed", path: input.baseSkillPath, hash: validation.packageHash };
}
function proofDecision(input, workflow, candidateId, packageHash5) {
  if (input.proof === void 0) return void 0;
  return {
    schemaVersion: "skillloom-workflow-proof-v1",
    decisionId: `proof-${stableUuid2(`${input.operationId}:${workflow.id}:${candidateId}`)}`,
    idempotencyKey: input.operationId,
    verdict: input.proof.status,
    workflow: {
      artifactId: workflow.id,
      revision: workflow.revision,
      contentHash: workflow.contentHash
    },
    candidate: { candidateId, packageHash: packageHash5 },
    verifier: {
      kind: input.proof.kind,
      summary: input.proof.summary,
      evidence: input.proof.kind === "replay" ? input.proof.command : `${input.proof.score}/${input.proof.threshold}`
    },
    provenanceHashes: [...input.proof.provenanceHashes],
    decidedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function stableTimestamp(updatedAt, operationId) {
  const base = Number.isNaN(Date.parse(updatedAt)) ? /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z") : new Date(updatedAt);
  const offset = Number.parseInt(createHash15("sha256").update(operationId).digest("hex").slice(0, 8), 16) % 1e3;
  return new Date(base.getTime() + offset).toISOString();
}
function stableUuid2(value) {
  const hash2 = createHash15("sha256").update(value).digest("hex");
  return `${hash2.slice(0, 8)}-${hash2.slice(8, 12)}-4${hash2.slice(13, 16)}-a${hash2.slice(17, 20)}-${hash2.slice(20, 32)}`;
}

// src/demo/scenario.ts
var demoAgentA = "user:agent-a@demo.skillloom";
var demoAgentB = "user:agent-b@demo.skillloom";
var provenanceHash2 = `sha256:${"a".repeat(64)}`;
function demoWorkflowCapture(actor) {
  return {
    actor,
    requestId: "demo-workflow",
    type: "workflow",
    title: "Recover a stale Docker build",
    content: "Reuse the verified recovery steps instead of rediscovering them.",
    provenance: { provenanceHashes: [provenanceHash2], source: "agent-a" },
    details: {
      kind: "workflow",
      trigger: "a Docker rebuild keeps serving stale output",
      steps: [
        "Confirm the stale behavior with the focused health check.",
        "Inspect the build inputs and cache boundary.",
        "Rebuild the affected image without reusing the stale layer.",
        "Run the focused health check again.",
        "Record the verified outcome and source."
      ],
      verifier: "focused replay",
      promotable: true
    },
    sensitivity: "tailnet"
  };
}
function demoReplayProof(workflow, status) {
  return {
    kind: "replay",
    status,
    workflow: {
      artifactId: workflow.id,
      revision: workflow.revision,
      contentHash: workflow.contentHash
    },
    summary: status === "passed" ? "focused replay passed" : "focused replay failed",
    command: "node --test focused-replay.test.ts",
    provenanceHashes: [provenanceHash2]
  };
}

// src/demo/checks.ts
async function runDemoChecks(runtime, projectRoot, homeDir) {
  const workflow = await runtime.runAs(demoAgentA, async () => {
    const actor = runtime.actor(demoAgentA);
    const captured = await runtime.brain.capture(demoWorkflowCapture(actor));
    return await runtime.brain.read({ actor, artifactId: captured.artifact.id });
  });
  const retrieved = await runtime.runAs(demoAgentB, async () => await runtime.brain.retrieve({
    actor: runtime.actor(demoAgentB),
    query: "stale Docker build",
    tier: "quick",
    limit: 5
  }));
  assertDemo(retrieved.results[0]?.id === workflow.id, "Agent B did not retrieve Agent A's workflow");
  const checks = [{
    name: "cross-agent-retrieval",
    status: "passed",
    evidence: `${workflow.id} ranked first for agent B`
  }];
  const input = {
    projectRoot,
    homeDir,
    brain: runtime.brain,
    actorId: demoAgentB,
    workflowArtifactId: workflow.id,
    action: "create"
  };
  const draft = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-missing-proof"
  }));
  assertDemo(draft.status === "draft", "Workflow without proof did not stay a draft");
  checks.push({
    name: "missing-proof-stays-draft",
    status: "passed",
    evidence: draft.reason
  });
  const failed = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-failed-proof",
    proof: demoReplayProof(workflow, "failed")
  }));
  assertDemo(failed.status === "rejected", "Failed verifier proof was not rejected");
  checks.push({
    name: "failed-proof-is-rejected",
    status: "passed",
    evidence: failed.reason
  });
  await setMode(projectRoot, "manual");
  const blocked = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-manual-promotion",
    proof: demoReplayProof(workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  }));
  assertDemo(blocked.status === "rejected", "Manual mode did not block policy promotion");
  checks.push({
    name: "manual-mode-blocks-promotion",
    status: "passed",
    evidence: blocked.reason
  });
  await setMode(projectRoot, "policy");
  const promoted = await runtime.runAs(demoAgentB, async () => await governWorkflowUpdate({
    ...input,
    operationId: "demo-policy-promotion",
    proof: demoReplayProof(workflow, "passed"),
    promote: { targets: ["codex"], scope: "project" }
  }));
  assertDemo(promoted.status === "promoted", "Policy mode did not promote the proved workflow");
  const destination = join41(projectRoot, ".agents", "skills", promoted.candidate.metadata.name, "SKILL.md");
  await access6(destination);
  checks.push({
    name: "policy-mode-promotes",
    status: "passed",
    evidence: `${promoted.candidate.candidateId} installed after proof and policy approval`
  });
  const rolledBack = await rollbackCommand({
    command: "rollback",
    promotionId: promoted.promotion.promotionId,
    yes: true,
    force: false,
    json: true
  }, projectRoot);
  assertDemo(rolledBack.result === "rolled-back", "Promotion rollback did not complete");
  assertDemo(!await exists2(destination), "Rolled-back skill is still installed");
  checks.push({
    name: "rollback-removes-skill",
    status: "passed",
    evidence: `${promoted.promotion.promotionId} restored the pre-promotion state`
  });
  return checks;
}
function assertDemo(condition, message2) {
  if (!condition) throw new Error(message2);
}
async function exists2(path) {
  return await access6(path).then(() => true, () => false);
}

// src/demo/service.ts
async function runDemo(keep) {
  const started = performance.now();
  const workspace = await mkdtemp3(join42(tmpdir2(), "skillloom-demo-"));
  const projectRoot = join42(workspace, "project");
  const homeDir = join42(workspace, "home");
  const brainRoot = join42(workspace, "brain");
  let runtime = null;
  try {
    await Promise.all([mkdir24(projectRoot), mkdir24(homeDir)]);
    await initCommand({ command: "init", root: projectRoot, json: true });
    runtime = await createEvaluationBrainRuntime(brainRoot, [demoAgentA, demoAgentB]);
    const checks = await runDemoChecks(runtime, projectRoot, homeDir);
    return {
      command: "demo",
      workspace,
      workspaceRetained: keep,
      durationMs: roundedDuration(started),
      checks,
      summary: { passed: checks.length, failed: 0 }
    };
  } finally {
    try {
      await runtime?.close();
    } finally {
      if (!keep) await rm16(workspace, { recursive: true, force: true });
    }
  }
}
function roundedDuration(started) {
  return Number((performance.now() - started).toFixed(2));
}

// src/commands/demo.ts
async function demoCommand(command) {
  return await runDemo(command.keep);
}

// src/benchmarks/brain-retrieval.ts
import { performance as performance2 } from "node:perf_hooks";

// src/benchmarks/brain-corpus.ts
var benchmarkActorId = "user:benchmark@skillloom.local";
async function populateBrainBenchmarkCorpus(runtime, records) {
  const actor = runtime.actor(benchmarkActorId);
  const english = await runtime.brain.capture({
    actor,
    requestId: "benchmark-english-target",
    type: "note",
    title: "Stale Docker layer cache",
    content: "A stale Docker layer cache blocks rebuild verification until the affected image is rebuilt.",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  const thai = await runtime.brain.capture({
    actor,
    requestId: "benchmark-thai-target",
    type: "note",
    title: "\u0E41\u0E04\u0E0A Docker \u0E04\u0E49\u0E32\u0E07",
    content: "\u0E41\u0E04\u0E0A Docker \u0E04\u0E49\u0E32\u0E07 \u0E17\u0E33\u0E43\u0E2B\u0E49\u0E1C\u0E25 build \u0E40\u0E01\u0E48\u0E32\u0E22\u0E31\u0E07\u0E16\u0E39\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E15\u0E49\u0E2D\u0E07\u0E15\u0E23\u0E27\u0E08\u0E43\u0E2B\u0E21\u0E48\u0E2B\u0E25\u0E31\u0E07 rebuild",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  await runtime.brain.capture({
    actor,
    requestId: "benchmark-distractor",
    type: "note",
    title: "Container networking",
    content: "Private container networking keeps application ports on loopback.",
    provenance: { source: "benchmark-corpus" },
    sensitivity: "private"
  });
  for (let index = 3; index < records; index += 1) {
    await runtime.brain.capture({
      actor,
      requestId: `benchmark-filler-${index}`,
      type: "note",
      title: `Operational note ${index}`,
      content: `Deterministic filler record ${index} covers unrelated operational topic group ${index % 17}.`,
      provenance: { source: "benchmark-corpus", ordinal: index },
      sensitivity: "private"
    });
  }
  return { english: english.artifact, thai: thai.artifact };
}
function brainBenchmarkCases(targets) {
  return [
    {
      name: "english-exact",
      query: "stale Docker layer cache",
      targetId: targets.english.id,
      required: true
    },
    {
      name: "thai-exact",
      query: "\u0E41\u0E04\u0E0A Docker \u0E04\u0E49\u0E32\u0E07",
      targetId: targets.thai.id,
      required: true
    },
    {
      name: "cross-language",
      query: "stale Docker cache",
      targetId: targets.thai.id,
      required: false
    }
  ];
}

// src/benchmarks/workspace.ts
import { mkdir as mkdir25, mkdtemp as mkdtemp4, readFile as readFile22, readdir as readdir11, rm as rm17, writeFile as writeFile5 } from "node:fs/promises";
import { tmpdir as tmpdir3 } from "node:os";
import { join as join43, resolve as resolve10 } from "node:path";
var markerName = ".skillloom-retrieval-benchmark.json";
var schemaVersion = 1;
async function prepareRetrievalBenchmarkWorkspace(input) {
  if (!input.workspace) {
    const root5 = await mkdtemp4(join43(tmpdir3(), "skillloom-retrieval-benchmark-"));
    try {
      await initialize(root5, input.records);
      return {
        root: root5,
        brainRoot: join43(root5, "brain"),
        retained: input.keep,
        resumed: false,
        cleanup: input.keep ? async () => void 0 : async () => await rm17(root5, { recursive: true, force: true })
      };
    } catch (error) {
      await rm17(root5, { recursive: true, force: true });
      throw error;
    }
  }
  const root4 = resolve10(input.workspace);
  await mkdir25(root4, { recursive: true });
  const entries = await readdir11(root4);
  const resumed = entries.includes(markerName);
  if (!resumed && entries.length > 0) {
    throw new Error(`Benchmark workspace is not empty and has no ${markerName} marker`);
  }
  if (resumed) {
    await validateMarker(root4, input.records);
  } else {
    await initialize(root4, input.records);
  }
  return {
    root: root4,
    brainRoot: join43(root4, "brain"),
    retained: true,
    resumed,
    cleanup: async () => void 0
  };
}
async function initialize(root4, records) {
  await writeFile5(
    join43(root4, markerName),
    `${JSON.stringify({ schemaVersion, records }, null, 2)}
`,
    { flag: "wx", mode: 384 }
  );
  await mkdir25(join43(root4, "brain"));
}
async function validateMarker(root4, records) {
  const value = JSON.parse(await readFile22(join43(root4, markerName), "utf8"));
  if (typeof value !== "object" || value === null || !("schemaVersion" in value) || value.schemaVersion !== schemaVersion || !("records" in value) || value.records !== records) {
    throw new Error("Benchmark workspace marker does not match this corpus size or schema");
  }
  await mkdir25(join43(root4, "brain"), { recursive: true });
}

// src/benchmarks/brain-retrieval.ts
async function runBrainRetrievalBenchmark(input) {
  if (!Number.isSafeInteger(input.records) || input.records < 3) {
    throw new Error("Retrieval benchmark requires at least 3 records");
  }
  if (!Number.isSafeInteger(input.iterations) || input.iterations < 1) {
    throw new Error("Retrieval benchmark requires at least 1 iteration");
  }
  const workspace = await prepareRetrievalBenchmarkWorkspace(input);
  let runtime = null;
  try {
    const initialRuntime = await createEvaluationBrainRuntime(workspace.brainRoot, [benchmarkActorId]);
    runtime = initialRuntime;
    const ingestStarted = performance2.now();
    const targets = await initialRuntime.runAs(
      benchmarkActorId,
      async () => await populateBrainBenchmarkCorpus(initialRuntime, input.records)
    );
    const ingestMs = elapsed(ingestStarted);
    await initialRuntime.close();
    runtime = null;
    const startupStarted = performance2.now();
    const reopenedRuntime = await createEvaluationBrainRuntime(workspace.brainRoot, [benchmarkActorId]);
    runtime = reopenedRuntime;
    const coldStartMs = elapsed(startupStarted);
    const latencies = [];
    const cases = await reopenedRuntime.runAs(
      benchmarkActorId,
      async () => await evaluate(reopenedRuntime, targets, input.iterations, latencies)
    );
    return {
      command: "benchmark",
      kind: "retrieval",
      implementation: "fts5-bm25-graph",
      records: input.records,
      iterations: input.iterations,
      workspace: workspace.root,
      workspaceRetained: workspace.retained,
      resumed: workspace.resumed,
      cases,
      metrics: {
        ingestMs,
        coldStartMs,
        queryP50Ms: percentile(latencies, 0.5),
        queryP95Ms: percentile(latencies, 0.95)
      }
    };
  } finally {
    try {
      await runtime?.close();
    } finally {
      await workspace.cleanup();
    }
  }
}
async function evaluate(runtime, targets, iterations, latencies) {
  const results = [];
  for (const benchmarkCase of brainBenchmarkCases(targets)) {
    let rank = null;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance2.now();
      const retrieved = await runtime.brain.retrieve({
        actor: runtime.actor(benchmarkActorId),
        query: benchmarkCase.query,
        tier: "quick",
        limit: 5
      });
      latencies.push(performance2.now() - started);
      const currentRank = retrieved.results.findIndex(({ id }) => id === benchmarkCase.targetId);
      if (currentRank >= 0) {
        rank = rank === null ? currentRank + 1 : Math.min(rank, currentRank + 1);
      }
    }
    results.push({
      name: benchmarkCase.name,
      query: benchmarkCase.query,
      required: benchmarkCase.required,
      recallAt5: rank === null ? 0 : 1,
      rank
    });
  }
  return results;
}
function elapsed(started) {
  return Number((performance2.now() - started).toFixed(2));
}
function percentile(values, quantile) {
  const sorted2 = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted2.length - 1, Math.max(0, Math.ceil(sorted2.length * quantile) - 1));
  return Number((sorted2[index] ?? 0).toFixed(2));
}

// src/commands/benchmark.ts
async function benchmarkCommand(command) {
  return await runBrainRetrievalBenchmark(command);
}

// src/cli/main.ts
async function main(argv = process.argv.slice(2)) {
  try {
    const command = parseArguments(argv);
    const result = await run(command);
    if (result !== void 0) {
      process.stdout.write(formatOutput(result, command.json));
    }
    return hasSetupFailure(result) ? 1 : 0;
  } catch (error) {
    const exitCode = error instanceof SkillloomError ? error.exitCode : 1;
    const message2 = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message2}
`);
    return exitCode;
  }
}
async function run(command) {
  if (command.command === "demo") {
    return await demoCommand(command);
  }
  if (command.command === "benchmark") {
    return await benchmarkCommand(command);
  }
  if (command.command === "setup") {
    return await setupCommand(command);
  }
  if (command.command === "sync") {
    return await syncCommand(command);
  }
  if (command.command === "bridge") {
    await bridgeCommand();
    return void 0;
  }
  if (command.command === "host") {
    return await hostCommand(command);
  }
  if (command.command === "init") {
    return await initCommand(command);
  }
  if (command.command === "capture") {
    return await captureCommand(command);
  }
  if (command.command === "validate") {
    return await validateCommand(command);
  }
  if (command.command === "promote") {
    return await promoteCommand(command);
  }
  if (command.command === "doctor") {
    return await doctorCommand(command);
  }
  if (command.command === "resume") {
    return await resumeCommand(command);
  }
  if (command.command === "rollback") {
    return await rollbackCommand(command);
  }
  if (command.command === "recover-lock") {
    return await recoverLockCommand(command);
  }
  if (command.command === "mode") {
    return await modeCommand(command);
  }
  if (command.command === "observe") {
    return await observeCommand(command);
  }
  if (command.command === "consolidate-learning") {
    return await consolidateLearningCommand(command);
  }
  if (command.command === "journey") {
    return await journeyCommand(command);
  }
  return await statusCommand(command);
}
function hasSetupFailure(value) {
  return typeof value === "object" && value !== null && "command" in value && value.command === "setup" && "targets" in value && Array.isArray(value.targets) && value.targets.some((target) => typeof target === "object" && target !== null && "status" in target && target.status === "failed");
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath2(import.meta.url)) {
  process.exitCode = await main();
}
export {
  main
};
