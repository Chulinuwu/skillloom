export type DemoCheckName =
  | "cross-agent-retrieval"
  | "missing-proof-stays-draft"
  | "failed-proof-is-rejected"
  | "manual-mode-blocks-promotion"
  | "policy-mode-promotes"
  | "rollback-removes-skill";

export type DemoCheck = Readonly<{
  name: DemoCheckName;
  status: "passed";
  evidence: string;
}>;

export type DemoResult = Readonly<{
  command: "demo";
  workspace: string;
  workspaceRetained: boolean;
  durationMs: number;
  checks: readonly DemoCheck[];
  summary: {
    passed: number;
    failed: 0;
  };
}>;
