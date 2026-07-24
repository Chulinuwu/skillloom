import type { Scope, SetupHubMode, SetupRole } from "../domain/types.js";

export type SetupHarnessTarget = "claude" | "codex" | "agents";
export type SetupTarget = SetupHarnessTarget | "auto";

export type HubSetupDiscovery =
  | { mode: "local-only"; attempted?: readonly string[] }
  | {
      mode: "connected";
      endpoint: string;
      hubInstanceId: string;
      signingKeyFingerprint: string;
    };

export type HubReconcileResult = {
  applied: boolean;
  pulled: number;
  imported: number;
  conflicts: string[];
};

export type HubReconcileRequest =
  | { root: string; apply: boolean; strictInitial?: false }
  | { root: string; apply: true; strictInitial: true };

export interface HubSetupPort {
  discover(root: string, hubUrl?: string): Promise<HubSetupDiscovery>;
  trust(root: string, discovery: Extract<HubSetupDiscovery, { mode: "connected" }>): Promise<{ trusted: true }>;
  verifyBrainRead(root: string): Promise<{ verified: true }>;
  reconcile(request: HubReconcileRequest): Promise<HubReconcileResult>;
}

export interface ConsentPort {
  readonly interactive: boolean;
  confirm(message: string): Promise<boolean>;
}

export type HarnessInstallRequest = {
  target: SetupHarnessTarget;
  scope: Scope;
  packageVersion: string;
  packageRoot: string;
  destinationRoot: string;
};

export type HarnessInstallResult = {
  target: SetupHarnessTarget;
  status: "installed" | "unchanged" | "failed" | "not-detected";
  message: string;
};

export interface HarnessInstallerPort {
  detect(target: SetupHarnessTarget): Promise<boolean>;
  install(request: HarnessInstallRequest): Promise<HarnessInstallResult>;
}

export type SetupHostResult = {
  command: "host";
  action: "install" | "status";
  status: "running" | "degraded" | "stopped";
  root: string;
  policyPath: string;
  surfaces: SetupSurfaces | null;
  nextActions: string[];
};

export interface SetupHostPort {
  install(yes: boolean): Promise<SetupHostResult>;
}

export interface PortableSkillInstallerPort {
  install(packageRoot: string, destinationRoot: string): Promise<"installed" | "unchanged">;
}

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export interface ProcessPort {
  findExecutable(name: string): Promise<string | null>;
  run(executable: string, args: string[], environment?: NodeJS.ProcessEnv, timeoutMs?: number): Promise<ProcessResult>;
}

export type SetupEnvironment = {
  tailscale: "authenticated" | "needs-login" | "missing";
  docker: "available" | "missing";
};

export type SetupGuidanceSource = {
  kind: "official-doc" | "cli-help";
  title: string;
  url?: string;
  fetchedAt: string;
  pageDate?: string;
  contentHash: string;
  snippets: string[];
};

export type SetupPlanStep = {
  id: string;
  title: string;
  action: "automatic" | "human";
  command?: string;
  verification: string;
  sourceTitles?: string[];
};

export type SetupRolePlan = {
  role: SetupRole | "role-required";
  status: "ready" | "needs-human" | "blocked";
  environment: SetupEnvironment;
  sources: SetupGuidanceSource[];
  steps: SetupPlanStep[];
  checkpoints: string[];
  warnings: string[];
};

export interface SetupGuidancePort {
  plan(request: SetupRequest, environment: SetupEnvironment): Promise<SetupRolePlan>;
}

export interface SetupEnvironmentPort {
  detect(): Promise<SetupEnvironment>;
}

export type SetupRequest = {
  target: SetupTarget;
  hub: SetupHubMode;
  hubUrl?: string;
  scope: Scope;
  yes: boolean;
  role?: SetupRole;
};

export type SetupSurfaces = {
  hub: { url: string; externalPort: 443 };
  obsidian: {
    url: string;
    externalPort: 8443;
    internalPort: 3000;
    workspaces: {
      library: { path: "Library"; access: "managed-projection" };
      dashboards: { path: "Bases"; access: "writable-ui-state" };
      authoring: { path: "Authoring"; access: "writable-staging" };
    };
  };
};

export type SetupResult = {
  command: "setup";
  hub: HubSetupDiscovery;
  host: SetupHostResult | null;
  surfaces: SetupSurfaces | null;
  targets: HarnessInstallResult[];
  reconciled: HubReconcileResult | null;
  plan?: SetupRolePlan;
};

export interface SetupServicePort {
  setup(request: SetupRequest): Promise<SetupResult>;
  sync(apply: boolean): Promise<{ command: "sync" } & HubReconcileResult>;
}
