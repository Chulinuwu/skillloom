import { SCANNER_RULES } from "../security/patterns.js";

const learningSecretPatterns = [
  /\btranscript\b/iu,
  /\b(?:password|passwd|pwd|secret|token|cookie|set-cookie)\s*[:=]\s*\S+/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/u
];

export function redactLearningText(value: string, limit: number): string {
  const cleaned = value.trim().replace(/\s+/gu, " ").slice(0, limit) || "[REDACTED]";
  return containsUnsafeLearningText(cleaned) ? "[REDACTED]" : cleaned;
}

export function containsUnsafeLearningText(value: string): boolean {
  return SCANNER_RULES.some((rule) => {
    rule.pattern.lastIndex = 0;
    return rule.severity === "danger" && rule.pattern.test(value);
  }) || learningSecretPatterns.some((pattern) => pattern.test(value));
}
