import type { TrustSeverity } from "../domain/types.js";

export type ScannerRule = {
  ruleId: string;
  severity: TrustSeverity;
  pattern: RegExp;
  message: string;
};

export const SCANNER_RULES: ScannerRule[] = [
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
