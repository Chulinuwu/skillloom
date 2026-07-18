import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { CandidateRecord, CandidateState, PackageFile, TrustFinding } from "../domain/types.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { storeLayout } from "./layout.js";
import { MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_LENGTH } from "../config/defaults.js";

export async function writeCandidateSnapshot(root: string, record: CandidateRecord, files: PackageFile[]): Promise<void> {
  const layout = storeLayout(root);
  const candidateRoot = join(layout.candidates, record.candidateId);
  const skillRoot = join(candidateRoot, "skill");
  await mkdir(layout.candidates, { recursive: true });
  await mkdir(candidateRoot).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new Error(`Candidate already exists: ${record.candidateId}`);
    }
    throw error;
  });
  try {
    await mkdir(skillRoot);
    for (const file of files) {
      const destination = join(skillRoot, file.relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(file.absolutePath), { mode: file.mode });
      await chmod(destination, file.mode & 0o777);
    }
    await atomicWriteJson(join(candidateRoot, "candidate.json"), record);
  } catch (error) {
    await rm(candidateRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function readCandidate(root: string, candidateId: string): Promise<CandidateRecord> {
  if (!/^cand-[a-zA-Z0-9-]+$/.test(candidateId)) {
    throw new Error(`Invalid candidate ID: ${candidateId}`);
  }
  return JSON.parse(await readFile(join(storeLayout(root).candidates, candidateId, "candidate.json"), "utf8")) as CandidateRecord;
}

export async function updateCandidateValidation(root: string, candidateId: string, findings: TrustFinding[]): Promise<CandidateRecord> {
  const candidate = await readCandidate(root, candidateId);
  const state = stateAfterValidation(candidate.state, findings);
  if (state === candidate.state && (state === "promoted" || state === "superseded")) {
    return candidate;
  }
  const updated: CandidateRecord = { ...candidate, state, findings };
  await atomicWriteJson(join(storeLayout(root).candidates, candidateId, "candidate.json"), updated);
  return updated;
}

export async function listCandidates(root: string): Promise<CandidateRecord[]> {
  const layout = storeLayout(root);
  try {
    const ids = await readdir(layout.candidates);
    const records = await Promise.all(ids.sort().map((id) => readCandidate(root, id)));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function createCandidateId(createdAt: string, packageHash: string): string {
  const stable = createHash("sha256").update(`${createdAt}\0${packageHash}`).digest("hex").slice(0, 12);
  return `cand-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${stable}`;
}

export function cleanEvidence(evidence: string[]): string[] {
  return evidence.slice(0, MAX_EVIDENCE_ITEMS).map((item) => {
    const trimmed = item.trim().slice(0, MAX_EVIDENCE_LENGTH);
    if (/(transcript|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-)/i.test(trimmed)) {
      return "[REDACTED]";
    }
    return trimmed;
  });
}

export function stateForFindings(findings: TrustFinding[]): "captured" | "blocked" {
  return findings.some((finding) => finding.severity === "danger") ? "blocked" : "captured";
}

export function stateAfterValidation(state: CandidateState, findings: TrustFinding[]): CandidateState {
  if (state === "promoted" || state === "superseded") {
    return state;
  }
  return findings.some((finding) => finding.severity === "danger") ? "blocked" : "validated";
}
