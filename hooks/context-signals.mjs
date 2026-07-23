const MUTATION_TOOL = /(?:^|[_-])(?:edit|write|apply[_-]?patch|notebook[_-]?edit|create|update|delete|capture|link)(?:$|[_-])/u;
const RESEARCH_TOOL = /(?:^|[_-])(?:search|fetch|retrieve|read|open|query|browse)(?:$|[_-])/u;
const VERIFICATION_TOOL = /(?:^|[_-])(?:test|check|lint|build|verify|doctor|exec|shell|bash)(?:$|[_-])/u;
const CORRECTION_SIGNAL = /(?:\b(?:actually|correction|incorrect|instead|not what i meant|that's wrong)\b|(?:ไม่ใช่|ผิด|แก้ใหม่|จริง[ๆ]?แล้ว|หมายถึง))/iu;

export function classifyToolName(name) {
  const normalized = name.replaceAll(/[^a-zA-Z0-9_-]/gu, "_").toLowerCase();
  return {
    mutation: MUTATION_TOOL.test(normalized),
    research: RESEARCH_TOOL.test(normalized),
    verification: VERIFICATION_TOOL.test(normalized)
  };
}

export function containsCorrectionSignal(text) {
  return CORRECTION_SIGNAL.test(text);
}
