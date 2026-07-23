import type { Command, Scope, ScopedTargetName, TargetName } from "../domain/types.js";
import { UsageError } from "../domain/errors.js";
import { parseLearningArguments } from "./learning-arguments.js";
import { parseSetupArguments } from "./setup-arguments.js";
import { parseHostArguments } from "./host-arguments.js";

export function parseArguments(argv: string[]): Command {
  const args = [...argv];
  const json = takeFlag(args, "--json");
  const command = args.shift();
  const setupCommand = parseSetupArguments(command, args, json);
  if (setupCommand) {
    return setupCommand;
  }
  const hostCommand = parseHostArguments(command, args, json);
  if (hostCommand) return hostCommand;
  const learningCommand = parseLearningArguments(command, args, { json });
  if (learningCommand) {
    return learningCommand;
  }
  if (command === "init") {
    rejectUnknown(args);
    return { command, root: process.cwd(), json };
  }
  if (command === "demo") {
    const keep = takeFlag(args, "--keep");
    rejectUnknown(args);
    return { command, keep, json };
  }
  if (command === "benchmark") {
    const kind = args.shift();
    if (kind !== "retrieval") {
      throw new UsageError("benchmark requires retrieval");
    }
    const records = positiveInteger(takeValue(args, "--records") ?? "1000", "--records");
    const iterations = positiveInteger(takeValue(args, "--iterations") ?? "5", "--iterations");
    const keep = takeFlag(args, "--keep");
    const workspace = takeValue(args, "--workspace");
    rejectUnknown(args);
    return workspace
      ? { command, kind, records, iterations, keep, workspace, json }
      : { command, kind, records, iterations, keep, json };
  }
  if (command === "capture") {
    const source = args.shift();
    if (!source) {
      throw new UsageError("capture requires a source directory");
    }
    const createdBy = takeValue(args, "--created-by") ?? "agent";
    if (createdBy !== "agent" && createdBy !== "human") {
      throw new UsageError("--created-by must be agent or human");
    }
    const evidence = takeValues(args, "--evidence");
    const base = takeValue(args, "--base");
    rejectUnknown(args);
    return base ? { command, source, createdBy, evidence, base, json } : { command, source, createdBy, evidence, json };
  }
  if (command === "validate") {
    const candidateId = args.shift();
    if (!candidateId) {
      throw new UsageError("validate requires a candidate ID");
    }
    rejectUnknown(args);
    return { command, candidateId, json };
  }
  if (command === "promote") {
    const candidateId = args.shift();
    if (!candidateId) {
      throw new UsageError("promote requires a candidate ID");
    }
    const targets = parseTargets(takeValues(args, "--target"));
    if (targets.length === 0) {
      throw new UsageError("promote requires at least one --target");
    }
    const scopeValue = takeValue(args, "--scope");
    const yes = takeFlag(args, "--yes");
    const policy = takeFlag(args, "--policy");
    const acceptWarnings = takeFlag(args, "--accept-warnings");
    const destinationRoot = takeValue(args, "--destination");
    rejectUnknown(args);
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
      return { command, targetMode: "directory", candidateId, targets: ["generic"], destinationRoot, yes, acceptWarnings, ...(policy ? { policy } : {}), json };
    }
    if (destinationRoot) {
      throw new UsageError("--destination is only valid for the generic target");
    }
    return {
      command,
      targetMode: "scoped",
      candidateId,
      targets: scopedTargets(targets),
      scope: parseScope(scopeValue ?? "project"),
      yes,
      acceptWarnings,
      ...(policy ? { policy } : {}),
      json
    };
  }
  if (command === "status") {
    rejectUnknown(args);
    return { command, json };
  }
  if (command === "recover-lock") {
    const lock = args.shift();
    if (lock !== "journal") {
      throw new UsageError("recover-lock requires journal");
    }
    const yes = takeFlag(args, "--yes");
    rejectUnknown(args);
    return { command, lock, yes, json };
  }
  if (command === "resume") {
    const operationId = args.shift();
    if (!operationId) {
      throw new UsageError("resume requires an operation ID");
    }
    const yes = takeFlag(args, "--yes");
    rejectUnknown(args);
    return { command, operationId, yes, json };
  }
  if (command === "doctor") {
    const values = takeValues(args, "--target");
    const targets = values.length === 0 ? ["claude", "codex"] satisfies ScopedTargetName[] : parseTargets(values);
    const destinationRoot = takeValue(args, "--destination");
    rejectUnknown(args);
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
    rejectUnknown(args);
    return { command, promotionId, yes, force, json };
  }
  throw new UsageError(command ? `Unknown command: ${command}` : "Missing command");
}
function parseTargets(values: string[]): TargetName[] {
  const targets = splitTargets(values);
  for (const target of targets) {
    if (target !== "claude" && target !== "codex" && target !== "agents" && target !== "generic") {
      throw new UsageError(`Unknown target: ${target}`);
    }
  }
  const unique = new Set(targets);
  const order: TargetName[] = ["claude", "codex", "agents", "generic"];
  return order.filter((target) => unique.has(target));
}
function scopedTargets(targets: TargetName[]): ScopedTargetName[] {
  return targets.filter((target): target is ScopedTargetName => target !== "generic");
}
function splitTargets(values: string[]): string[] {
  return values.flatMap((value) => value.split(",")).map((target) => target.trim()).filter(Boolean);
}
function parseScope(value: string): Scope {
  if (value !== "project" && value !== "user") {
    throw new UsageError("--scope must be project or user");
  }
  return value;
}
function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function takeValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  args.splice(index, 2);
  return value;
}

function takeValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  let value = takeValue(args, flag);
  while (value !== undefined) {
    values.push(value);
    value = takeValue(args, flag);
  }
  return values;
}

function rejectUnknown(args: string[]): void {
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) {
    throw new UsageError(`Unknown flag: ${unknown}`);
  }
  if (args.length > 0) {
    throw new UsageError(`Unexpected argument: ${args[0]}`);
  }
}
