import type { Scope, SetupHubMode } from "../domain/types.js";

export type SetupHarnessTarget = "claude" | "codex" | "agents";
export type SetupTarget = SetupHarnessTarget | "auto";

export type HubSetupDiscovery =
  | { mode: "local-only" }
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
  discover(root: string): Promise<HubSetupDiscovery>;
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
  run(executable: string, args: string[]): Promise<ProcessResult>;
}

export type SetupRequest = {
  target: SetupTarget;
  hub: SetupHubMode;
  scope: Scope;
  yes: boolean;
};

export type SetupResult = {
  command: "setup";
  hub: HubSetupDiscovery;
  targets: HarnessInstallResult[];
  reconciled: HubReconcileResult | null;
};

export interface SetupServicePort {
  setup(request: SetupRequest): Promise<SetupResult>;
  sync(apply: boolean): Promise<{ command: "sync" } & HubReconcileResult>;
}
