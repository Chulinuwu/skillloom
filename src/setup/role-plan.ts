import type { SetupRole } from "../domain/types.js";
import type { SetupEnvironment, SetupGuidancePort, SetupGuidanceSource, SetupPlanStep, SetupRequest, SetupRolePlan } from "./types.js";

type SourceCollector = {
  collect(): Promise<SetupGuidanceSource[]>;
};

export class SetupRolePlanner implements SetupGuidancePort {
  constructor(private readonly sources: SourceCollector) {}

  async plan(request: SetupRequest, environment: SetupEnvironment): Promise<SetupRolePlan> {
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
}

export function resolveSetupRole(request: SetupRequest): SetupRole | null {
  if (request.role) return request.role;
  if (request.hub === "local") return "local-only";
  if (request.hubUrl) return "client-node";
  return null;
}

export function assertSafeSetupStepCommands(steps: readonly SetupPlanStep[]): void {
  for (const step of steps) {
    if (!step.command) continue;
    if (/\bfunnel\b/iu.test(step.command)) throw new Error("Setup plan must not use Tailscale Funnel");
    if (/\bTS_AUTHKEY\b/u.test(step.command)) throw new Error("Setup plan must not print or request secret-bearing auth keys");
  }
}

function roleSelectionSteps(): SetupPlanStep[] {
  return [{
    id: "choose-setup-role",
    title: "Choose whether this machine is Main Hub, Client Node, or This Machine Only",
    action: "human",
    verification: "Setup is rerun with --role main-hub, --role client-node, or --role local-only plus --hub local."
  }];
}

function stepsFor(role: SetupRole, request: SetupRequest, environment: SetupEnvironment, sources: SetupGuidanceSource[]): SetupPlanStep[] {
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

function clientSteps(request: SetupRequest, environment: SetupEnvironment, sources: SetupGuidanceSource[]): SetupPlanStep[] {
  const tailscaleSources = sourceTitles(sources, /tailscale|serve|service/iu);
  return [
    ...(environment.tailscale === "authenticated" ? [] : [{
      id: "tailscale-login",
      title: "Sign in to Tailscale on this device",
      action: "human" as const,
      verification: "tailscale status --json returns the current tailnet identity.",
      sourceTitles: tailscaleSources
    }]),
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

function mainHubSteps(environment: SetupEnvironment, sources: SetupGuidanceSource[]): SetupPlanStep[] {
  const tailscaleSources = sourceTitles(sources, /tailscale|serve|service/iu);
  const dockerSources = sourceTitles(sources, /docker|compose/iu);
  return [
    ...(environment.tailscale === "authenticated" ? [] : [{
      id: "tailscale-login",
      title: "Sign in to Tailscale before exposing the Hub to the tailnet",
      action: "human" as const,
      verification: "tailscale status --json returns the Hub host identity.",
      sourceTitles: tailscaleSources
    }]),
    ...(environment.docker === "available" ? [] : [{
      id: "install-docker-compose",
      title: "Install Docker with Compose v2",
      action: "human" as const,
      verification: "docker compose version exits successfully.",
      sourceTitles: dockerSources
    }]),
    {
      id: "start-private-stack",
      title: "Start the private Hub and read-only Obsidian Web UI stack",
      action: "automatic",
      command: "skillloom host install --yes",
      verification: "Docker reports skillloom-hub and obsidian running, then Tailscale Serve publishes only tailnet HTTPS surfaces."
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

function warningsFor(role: SetupRole | null, environment: SetupEnvironment, sources: SetupGuidanceSource[]): string[] {
  const warnings = [
    ...(role === null ? ["Setup role is ambiguous; choose Main Hub, Client Node, or This Machine Only before any setup side effects."] : []),
    ...(role !== "local-only" && sources.length === 0 ? ["Dynamic official docs and local CLI help were unavailable; setup must not guess changing external steps."] : []),
    "Tailscale Funnel is not part of Skillloom setup; use private Tailscale Serve only.",
    "Secret-bearing values such as TS_AUTHKEY must stay in the local environment and never be pasted into chat."
  ];
  if (role === "main-hub" && environment.tailscale !== "authenticated") warnings.push("Main Hub setup needs a human Tailscale login or an explicit advanced headless auth-key workflow.");
  if (role !== null && externalSourceMissing(role, sources)) warnings.push("Dynamic guidance is missing required official or CLI evidence for one or more external setup steps.");
  return warnings;
}

function externalSourceMissing(role: SetupRole, sources: SetupGuidanceSource[]): boolean {
  if (role === "local-only") return false;
  const hasTailscale = sourceTitles(sources, /tailscale|serve|service/iu).length > 0;
  const hasDocker = role === "main-hub" ? sourceTitles(sources, /docker|compose/iu).length > 0 : true;
  return !hasTailscale || !hasDocker;
}

function sourceTitles(sources: SetupGuidanceSource[], pattern: RegExp): string[] {
  return sources
    .filter((source) => pattern.test(`${source.title}\n${source.snippets.join("\n")}`))
    .map((source) => source.title);
}

function checkpointsFor(role: SetupRole): string[] {
  return role === "main-hub"
    ? ["environment-detected", "dynamic-guidance-sourced", "host-state-prepared", "stack-started", "serve-verified"]
    : ["environment-detected", "dynamic-guidance-sourced", "hub-trusted", "brain-read-verified", "integrations-installed"];
}

function statusFor(steps: SetupPlanStep[], warnings: string[]): SetupRolePlan["status"] {
  if (warnings.some((warning) => warning.startsWith("Dynamic official docs") || warning.startsWith("Setup role") || warning.startsWith("Dynamic guidance is missing"))) return "blocked";
  return steps.some((step) => step.action === "human") ? "needs-human" : "ready";
}
