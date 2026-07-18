import { UsageError } from "../domain/errors.js";
import type { Command, JsonOutput, SkillloomMode } from "../domain/types.js";

export function parseLearningArguments(command: string | undefined, args: string[], output: JsonOutput): Command | undefined {
  if (command === "mode") {
    const mode = args.shift();
    rejectUnknown(args);
    if (mode === undefined) {
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
  if (command !== "observe") {
    return undefined;
  }
  const source = takeValue(args, "--source");
  const outcome = takeValue(args, "--outcome");
  const summary = takeValue(args, "--summary");
  const candidateId = takeValue(args, "--candidate");
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
  return { command, source, outcome, summary, ...(candidateId ? { candidateId } : {}), ...output };
}

function isMode(value: string): value is SkillloomMode {
  return value === "manual" || value === "policy" || value === "hermes";
}

function isSource(value: string | undefined): value is "claude" | "codex" | "agents" {
  return value === "claude" || value === "codex" || value === "agents";
}

function isOutcome(value: string | undefined): value is "no-op" | "memory" | "skill-create" | "skill-patch" {
  return value === "no-op" || value === "memory" || value === "skill-create" || value === "skill-patch";
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

function rejectUnknown(args: string[]): void {
  if (args.length > 0) {
    throw new UsageError(args[0].startsWith("--") ? `Unknown flag: ${args[0]}` : `Unexpected argument: ${args[0]}`);
  }
}
