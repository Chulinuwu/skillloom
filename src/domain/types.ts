export type JsonOutput = { json: boolean };
export type ScopedTargetName = "claude" | "codex" | "agents";
export type RuntimeTargetName = "claude" | "codex";
export type TargetName = ScopedTargetName | "generic";
export type Scope = "project" | "user";
export type TargetScope = Scope | "explicit";
export type SkillloomMode = "manual" | "policy" | "hermes";
type PromoteCommandBase = {
  command: "promote";
  candidateId: string;
  yes: boolean;
  acceptWarnings: boolean;
  policy?: boolean;
};
type ScopedPromoteCommand = PromoteCommandBase & {
  targetMode: "scoped";
  targets: ScopedTargetName[];
  scope: Scope;
};
type GenericPromoteCommand = PromoteCommandBase & {
  targetMode: "directory";
  targets: ["generic"];
  destinationRoot: string;
};
type ScopedDoctorCommand = {
  command: "doctor";
  targetMode: "scoped";
  targets: ScopedTargetName[];
};
type GenericDoctorCommand = {
  command: "doctor";
  targetMode: "directory";
  targets: ["generic"];
  destinationRoot: string;
};
export type Command =
  | ({ command: "init"; root: string } & JsonOutput)
  | ({ command: "capture"; source: string; base?: string; createdBy: "agent" | "human"; evidence: string[] } & JsonOutput)
  | ({ command: "validate"; candidateId: string } & JsonOutput)
  | ((ScopedPromoteCommand | GenericPromoteCommand) & JsonOutput)
  | ({ command: "resume"; operationId: string; yes: boolean } & JsonOutput)
  | ({ command: "rollback"; promotionId: string; yes: boolean; force: boolean } & JsonOutput)
  | ({ command: "status" } & JsonOutput)
  | ({ command: "mode"; mode?: SkillloomMode } & JsonOutput)
  | ({ command: "observe"; source: "claude" | "codex" | "agents"; outcome: "no-op" | "memory" | "skill-create" | "skill-patch"; summary: string; candidateId?: string } & JsonOutput)
  | ({ command: "journey" } & JsonOutput)
  | ({ command: "recover-lock"; lock: "journal"; yes: boolean } & JsonOutput)
  | ((ScopedDoctorCommand | GenericDoctorCommand) & JsonOutput);
export type AdapterContext = {
  projectRoot: string;
  homeDir: string;
  executableSearchPath?: string;
};
type DoctorCheckBase = {
  target: TargetName;
  status: "ok" | "warning";
  message: string;
  remediation?: string;
};
export type DoctorCheck =
  | (DoctorCheckBase & { kind: "runtime"; executable: string; path?: string })
  | (DoctorCheckBase & { kind: "discovery-root"; scope: TargetScope; path: string })
  | (DoctorCheckBase & {
      kind: "installed-skill";
      scope: TargetScope;
      path: string;
      skillName: string;
      state: "valid";
      packageHash: string;
      findings: TrustFinding[];
    })
  | (DoctorCheckBase & {
      kind: "installed-skill";
      scope: TargetScope;
      path: string;
      skillName: string;
      state: "invalid";
      error: string;
    });
export type DoctorReport = {
  command: "doctor";
  checks: DoctorCheck[];
  summary: { ok: number; warnings: number };
};

export type CandidateState = "captured" | "validated" | "blocked" | "promoted" | "superseded";

export type SkillMetadata = {
  name: string;
  description: string;
};

export type PackageFile = {
  relativePath: string;
  absolutePath: string;
  size: number;
  mode: number;
};

export type TrustSeverity = "info" | "warning" | "danger";

export type TrustFinding = {
  ruleId: string;
  severity: TrustSeverity;
  file: string;
  line: number;
  message: string;
};

export type CandidateRecord = {
  candidateId: string;
  operationId: string;
  state: CandidateState;
  metadata: SkillMetadata;
  packageHash: string;
  createdAt: string;
  createdBy: "agent" | "human";
  evidence: string[];
  findings: TrustFinding[];
  base: CandidateBase;
};
export type CandidateBase =
  | { kind: "none" }
  | { kind: "installed"; path: string; hash: string };

export type PromotionTargetBefore =
  | { kind: "absent" }
  | { kind: "present"; hash: string; backupPath: string };
export type PromotionTargetRecord = {
  target: TargetName;
  scope: TargetScope;
  destination: string;
  before: PromotionTargetBefore;
  afterHash: string;
};
type PromotionRecordBase = {
  promotionId: string;
  operationId: string;
  candidateId: string;
  createdAt: string;
  targets: PromotionTargetRecord[];
};
export type PromotionCleanup =
  | { status: "pending" }
  | { status: "complete" }
  | { status: "residue"; warnings: string[] };
export type PromotionRecord =
  | (PromotionRecordBase & { result: "applied"; cleanup: PromotionCleanup })
  | (PromotionRecordBase & { result: "compensated"; error: string; cleanup: PromotionCleanup })
  | (PromotionRecordBase & {
      result: "rolled-back";
      rollbackOperationId: string;
      rolledBackAt: string;
      forced: boolean;
      cleanup: PromotionCleanup;
    });
export type OperationPhase =
  | "started"
  | "validated"
  | "snapshotted"
  | "candidate-verified"
  | "staged"
  | "backed-up"
  | "committed"
  | "compensating"
  | "compensated"
  | "interrupted"
  | "cleanup-warning"
  | "completed"
  | "failed"
  | "lock-archived";

export type JournalEvent = {
  sequence: number;
  timestamp: string;
  operationId: string;
  kind: "init" | "capture" | "validate" | "promote" | "resume" | "rollback" | "status" | "recovery" | "policy" | "learn";
  phase: OperationPhase;
  evidence?: unknown;
  error?: string;
};
