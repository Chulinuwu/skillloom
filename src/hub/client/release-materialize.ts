import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CandidateRecord, SkillCapability } from "../../domain/types.js";
import { validateSkillPackage } from "../../skills/validate.js";
import {
  commitCandidateSnapshot,
  discardCandidateSnapshot,
  stageCandidateSnapshot,
  type StagedCandidateSnapshot
} from "../../store/candidate-snapshot.js";
import { readCandidate, stateForFindings } from "../../store/candidates.js";
import { storeLayout } from "../../store/layout.js";
import { parsePackageBlob } from "../registry/index.js";
import { HubResponseValidationError } from "./errors.js";
import type { HubReleaseCandidateReference, VerifiedHubRelease } from "./release-types.js";

export async function materializeHubReleaseCandidate(
  root: string,
  verified: VerifiedHubRelease
): Promise<HubReleaseCandidateReference> {
  const release = verified.release;
  const candidateId = localCandidateId(release.sourceCandidateId, release.hubInstanceId, release.releaseId);
  const reference = candidateReference(candidateId, verified);
  const layout = storeLayout(root);
  await mkdir(layout.staging, { recursive: true });
  const importRoot = await mkdtemp(join(layout.staging, "hub-release-"));
  let snapshot: StagedCandidateSnapshot | undefined;
  try {
    const skillRoot = join(importRoot, "skill");
    await writePackageBlob(skillRoot, verified.blob);
    const validation = await validateSkillPackage(skillRoot, {
      expectedName: release.name,
      expectedHash: release.packageHash
    });
    if (validation.packageHash !== release.packageHash) {
      throw new HubResponseValidationError(`Materialized package hash mismatch for release ${release.releaseId}`);
    }
    assertCapabilitiesMatch(validation.metadata.capabilities ?? [], release.capabilities);
    const existing = await readCandidateIfPresent(root, candidateId);
    if (existing) return existingCandidate(reference, existing.packageHash);
    const operationId = `hub-import-${randomUUID()}`;
    snapshot = await stageCandidateSnapshot(root, operationId, skillRoot);
    const record: CandidateRecord = {
      candidateId,
      operationId,
      state: stateForFindings(validation.findings),
      metadata: validation.metadata,
      packageHash: validation.packageHash,
      createdAt: release.createdAt,
      createdBy: "agent",
      evidence: [
        `hub-instance:${release.hubInstanceId}`,
        `hub-release:${release.releaseId}`,
        `hub-release-sequence:${release.sequence}`,
        `hub-base-release:${release.supersedesReleaseHash ?? "none"}`
      ],
      findings: validation.findings,
      base: { kind: "none" }
    };
    try {
      await commitCandidateSnapshot(root, record, snapshot);
      snapshot = undefined;
      return reference;
    } catch (error) {
      const raced = await readCandidateIfPresent(root, candidateId);
      if (raced) return existingCandidate(reference, raced.packageHash);
      throw error;
    }
  } finally {
    if (snapshot) await discardCandidateSnapshot(snapshot).catch(() => undefined);
    await rm(importRoot, { recursive: true, force: true });
  }
}

async function writePackageBlob(root: string, value: VerifiedHubRelease["blob"]): Promise<void> {
  const blob = parsePackageBlob(value);
  await mkdir(root);
  for (const file of blob.files) {
    const path = join(root, ...file.relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(file.contentBase64, "base64"), { flag: "wx" });
    await chmod(path, file.mode);
  }
}

function candidateReference(candidateId: string, verified: VerifiedHubRelease): HubReleaseCandidateReference {
  const release = verified.release;
  return Object.freeze({
    candidateId,
    packageHash: release.packageHash,
    hubInstanceId: release.hubInstanceId,
    releaseId: release.releaseId,
    releaseSequence: release.sequence,
    baseReleaseHash: release.supersedesReleaseHash,
    provenance: Object.freeze([...release.provenance])
  });
}

function localCandidateId(sourceCandidateId: string, hubInstanceId: string, releaseId: string): string {
  if (sourceCandidateId.length <= 120 && /^cand-[a-zA-Z0-9-]+$/.test(sourceCandidateId)) return sourceCandidateId;
  const stable = createHash("sha256").update(`${hubInstanceId}\0${sourceCandidateId}\0${releaseId}`).digest("hex").slice(0, 24);
  return `cand-hub-${stable}`;
}

async function readCandidateIfPresent(root: string, candidateId: string): Promise<CandidateRecord | null> {
  try {
    return await readCandidate(root, candidateId);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function existingCandidate(reference: HubReleaseCandidateReference, packageHash: string): HubReleaseCandidateReference {
  if (packageHash !== reference.packageHash) {
    throw new HubResponseValidationError(`Candidate ID collision with different package content: ${reference.candidateId}`);
  }
  return reference;
}

function assertCapabilitiesMatch(metadata: readonly SkillCapability[], release: readonly SkillCapability[]): void {
  const left = [...metadata].sort();
  const right = [...release].sort();
  if (left.length !== right.length || left.some((capability, index) => capability !== right[index])) {
    throw new HubResponseValidationError("Materialized skill capabilities do not match the signed release");
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
