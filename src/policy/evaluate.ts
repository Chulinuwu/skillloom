import type { SkillloomConfig } from "../config/types.js";
import type { AutoPromotionRequest, PolicyDecision } from "./types.js";

export function evaluateAutoPromotion(config: SkillloomConfig, request: AutoPromotionRequest): PolicyDecision {
  const reasons: string[] = [];
  const totalBytes = request.files.reduce((total, file) => total + file.size, 0);
  if (config.mode === "manual") {
    reasons.push("manual mode requires explicit approval");
  }
  const deniedScopes = request.scopes.filter((scope) => scope !== config.policy.scope);
  if (deniedScopes.length > 0) {
    reasons.push(`scopes are outside the ${config.policy.scope} policy: ${[...new Set(deniedScopes)].join(",")}`);
  }
  const deniedTargets = request.targets.filter((target) => !config.policy.targets.some((allowed) => allowed === target));
  if (deniedTargets.length > 0) {
    reasons.push(`targets are outside policy: ${deniedTargets.join(",")}`);
  }
  const allowedCapabilities = config.policy.allowedCapabilities ?? [];
  const deniedCapabilities = (request.capabilities ?? []).filter((capability) => !allowedCapabilities.includes(capability));
  if (deniedCapabilities.length > 0) {
    reasons.push(`capabilities are outside policy: ${deniedCapabilities.join(",")}`);
  }
  if (request.files.length > config.policy.maxFiles) {
    reasons.push(`file count ${request.files.length} exceeds ${config.policy.maxFiles}`);
  }
  if (totalBytes > config.policy.maxTotalBytes) {
    reasons.push(`package size ${totalBytes} exceeds ${config.policy.maxTotalBytes}`);
  }
  if (!config.policy.allowExecutables && request.files.some((file) => (file.mode & 0o111) !== 0)) {
    reasons.push("executable files are not allowed by policy");
  }
  if (request.dangers > 0) {
    reasons.push("danger findings always block promotion");
  }
  if (!config.policy.allowWarnings && request.warnings > 0) {
    reasons.push("warning findings are not allowed by policy");
  }
  return {
    approved: reasons.length === 0,
    mode: config.mode,
    candidateId: request.candidateId,
    packageHash: request.packageHash,
    reasons,
    evaluatedAt: new Date().toISOString()
  };
}
