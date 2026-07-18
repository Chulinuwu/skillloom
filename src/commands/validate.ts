import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { CandidateRecord, Command } from "../domain/types.js";
import { ValidationError } from "../domain/errors.js";
import { validateSkillPackage, type SkillValidation } from "../skills/validate.js";
import { isModeAwarePackageHash } from "../skills/hash.js";
import { readCandidate, updateCandidateValidation } from "../store/candidates.js";
import { appendEvent } from "../store/journal.js";
import { withStoreLock } from "../files/lock.js";

export async function validateCommand(command: Extract<Command, { command: "validate" }>, projectRoot = process.cwd()): Promise<CandidateRecord> {
  return await withStoreLock(projectRoot, async () => {
    const operationId = `op-validate-${randomUUID()}`;
    await appendEvent(projectRoot, {
      operationId,
      kind: "validate",
      phase: "started",
      evidence: { candidateId: command.candidateId }
    });
    try {
      const candidate = await readCandidate(projectRoot, command.candidateId);
      if (!isModeAwarePackageHash(candidate.packageHash)) {
        throw new ValidationError("Legacy candidate must be recaptured before validation");
      }
      const validation = await validateSkillPackage(join(projectRoot, ".skillloom", "candidates", command.candidateId, "skill"), {
        expectedName: candidate.metadata.name,
        expectedHash: candidate.packageHash
      });
      assertCandidateMatches(candidate, validation);
      const validated = await updateCandidateValidation(projectRoot, command.candidateId, validation.findings);
      await appendEvent(projectRoot, {
        operationId,
        kind: "validate",
        phase: "validated",
        evidence: { packageHash: validation.packageHash, state: validated.state }
      });
      await appendEvent(projectRoot, { operationId, kind: "validate", phase: "completed", evidence: { candidateId: command.candidateId, findings: validation.findings.length } });
      return validated;
    } catch (error) {
      await appendEvent(projectRoot, { operationId, kind: "validate", phase: "failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
}

function assertCandidateMatches(candidate: CandidateRecord, validation: SkillValidation): void {
  if (candidate.metadata.name !== validation.metadata.name) {
    throw new ValidationError("Candidate metadata name does not match snapshot");
  }
  if (candidate.metadata.description !== validation.metadata.description) {
    throw new ValidationError("Candidate metadata description does not match snapshot");
  }
  if (candidate.packageHash !== validation.packageHash) {
    throw new ValidationError("Candidate package hash does not match snapshot");
  }
}
