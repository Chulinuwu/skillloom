import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureConfig } from "../config/service.js";
import { ValidationError } from "../domain/errors.js";
import type { CandidateBase, CandidateRecord, Command } from "../domain/types.js";
import { withStoreLock } from "../files/lock.js";
import type { CaptureOperation } from "../operations/types.js";
import { validateSkillPackage } from "../skills/validate.js";
import { cleanEvidence, createCandidateId, stateForFindings, writeCandidateSnapshot } from "../store/candidates.js";
import { appendEvent } from "../store/journal.js";
import { writeOperation } from "../store/operations.js";

export async function captureCommand(command: Extract<Command, { command: "capture" }>, projectRoot = process.cwd()): Promise<CandidateRecord> {
  await ensureConfig(projectRoot);
  return await withStoreLock(projectRoot, async () => {
    const operationId = `op-capture-${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const evidence = cleanEvidence(command.evidence);
    let checkpoint: CaptureOperation = {
      kind: "capture",
      operationId,
      createdAt,
      updatedAt: createdAt,
      status: "in-progress",
      phase: "started",
      recoveryAction: "Inspect temporary snapshot state and capture again"
    };
    await writeOperation(projectRoot, checkpoint);
    await appendEvent(projectRoot, { operationId, kind: "capture", phase: "started", evidence });
    try {
      const validation = await validateSkillPackage(resolve(command.source), { folderNamePolicy: "match-metadata" });
      const base = await captureBase(command.base, validation.metadata.name);
      checkpoint = { ...checkpoint, phase: "validated", updatedAt: new Date().toISOString() };
      await writeOperation(projectRoot, checkpoint);
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "validated", evidence: { packageHash: validation.packageHash } });
      const record: CandidateRecord = {
        candidateId: createCandidateId(createdAt, validation.packageHash),
        operationId,
        state: stateForFindings(validation.findings),
        metadata: validation.metadata,
        packageHash: validation.packageHash,
        createdAt,
        createdBy: command.createdBy,
        evidence,
        findings: validation.findings,
        base
      };
      await writeCandidateSnapshot(projectRoot, record, validation.files);
      checkpoint = { ...checkpoint, phase: "snapshotted", candidateId: record.candidateId, updatedAt: new Date().toISOString() };
      await writeOperation(projectRoot, checkpoint);
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "snapshotted", evidence: { candidateId: record.candidateId } });
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "completed", evidence: { state: record.state } });
      await writeOperation(projectRoot, {
        ...checkpoint,
        phase: "completed",
        status: "completed",
        recoveryAction: "None",
        updatedAt: new Date().toISOString()
      });
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeOperation(projectRoot, {
        ...checkpoint,
        status: "failed",
        recoveryAction: "Inspect the error and capture again",
        updatedAt: new Date().toISOString(),
        error: message
      });
      await appendEvent(projectRoot, { operationId, kind: "capture", phase: "failed", error: message });
      throw error;
    }
  });
}

async function captureBase(input: string | undefined, expectedName: string): Promise<CandidateBase> {
  if (!input) {
    return { kind: "none" };
  }
  const path = await realpath(resolve(input));
  const validation = await validateSkillPackage(path, { expectedName, folderNamePolicy: "match-metadata" });
  if (validation.findings.some((finding) => finding.severity === "danger")) {
    throw new ValidationError("Installed base package has danger findings");
  }
  return { kind: "installed", path, hash: validation.packageHash };
}
