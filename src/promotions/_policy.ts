import { join } from "node:path";
import { PromotionPolicyError, ValidationError } from "../domain/errors.js";
import { validateSkillPackage } from "../skills/validate.js";
import { isModeAwarePackageHash } from "../skills/hash.js";
import { readCandidate } from "../store/candidates.js";
import { storeLayout } from "../store/layout.js";

export async function verifyPromotionCandidate(root: string, candidateId: string) {
  const candidate = await readCandidate(root, candidateId);
  if (!isModeAwarePackageHash(candidate.packageHash)) {
    throw new ValidationError("Legacy candidate must be recaptured before promotion");
  }
  const canonical = join(storeLayout(root).candidates, candidateId, "skill");
  const validation = await validateSkillPackage(canonical, {
    expectedName: candidate.metadata.name,
    expectedHash: candidate.packageHash
  });
  if (candidate.packageHash !== validation.packageHash) {
    throw new ValidationError("Candidate package hash does not match canonical snapshot");
  }
  if (JSON.stringify(candidate.findings) !== JSON.stringify(validation.findings)) {
    throw new ValidationError("Candidate trust findings do not match canonical snapshot");
  }
  return { canonical, validation, candidate };
}

export function assertPromotionFindings(findings: Awaited<ReturnType<typeof validateSkillPackage>>["findings"], acceptWarnings: boolean): void {
  if (findings.some((finding) => finding.severity === "danger")) {
    throw new PromotionPolicyError("Danger findings block promotion");
  }
  if (!acceptWarnings && findings.some((finding) => finding.severity === "warning")) {
    throw new PromotionPolicyError("Warning findings require --accept-warnings");
  }
}
