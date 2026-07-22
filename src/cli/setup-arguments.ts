import { UsageError } from "../domain/errors.js";
import type { Command, Scope, SetupHubMode, SetupRole } from "../domain/types.js";

export function parseSetupArguments(command: string | undefined, args: string[], json: boolean): Command | null {
  if (command === "setup") return parseSetup(args, json);
  if (command === "sync") return parseSync(args, json);
  if (command === "bridge") return parseBridge(args, json);
  return null;
}

function parseSetup(args: string[], json: boolean): Extract<Command, { command: "setup" }> {
  const parsed = parseOptions(args, new Set(["--yes"]), new Set(["--target", "--hub", "--hub-url", "--scope", "--role"]));
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
  return { command: "setup", target, hub, ...(hubUrl ? { hubUrl } : {}), scope, yes: parsed.flags.has("--yes"), ...(role ? { role } : {}), json };
}

function parseSync(args: string[], json: boolean): Extract<Command, { command: "sync" }> {
  const parsed = parseOptions(args, new Set(["--apply"]), new Set());
  return { command: "sync", apply: parsed.flags.has("--apply"), json };
}

function parseBridge(args: string[], json: boolean): Extract<Command, { command: "bridge" }> {
  if (json) throw new UsageError("bridge does not support --json");
  const parsed = parseOptions(args, new Set(["--stdio"]), new Set());
  if (!parsed.flags.has("--stdio")) throw new UsageError("bridge requires --stdio");
  return { command: "bridge", stdio: true, json: false };
}

function parseOptions(args: string[], flags: Set<string>, values: Set<string>) {
  const parsed = { flags: new Set<string>(), values: new Map<string, string>() };
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

function parseScope(value: string): Scope {
  if (value !== "user" && value !== "project") throw new UsageError("--scope must be user or project");
  return value;
}
function isSetupHubMode(value: string): value is SetupHubMode {
  return value === "auto" || value === "local";
}
function parseSetupRole(value: string | undefined): SetupRole | undefined {
  if (value === undefined) return undefined;
  if (value === "main-hub" || value === "client-node" || value === "local-only") return value;
  throw new UsageError("--role must be main-hub, client-node, or local-only");
}
