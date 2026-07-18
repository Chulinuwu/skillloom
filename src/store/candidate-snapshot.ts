import { mkdir, rename, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { CandidateRecord } from "../domain/types.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { syncDirectory } from "../files/durability.js";
import { copyPackageFiles } from "../files/package-copy.js";
import { collectPackageFiles } from "../files/tree.js";
import { storeLayout } from "./layout.js";

export type StagedCandidateSnapshot = {
  stageRoot: string;
  skillRoot: string;
};

export async function stageCandidateSnapshot(root: string, operationId: string, source: string): Promise<StagedCandidateSnapshot> {
  const layout = storeLayout(root);
  const stageRoot = join(layout.staging, `capture-${operationId}`);
  const skillRoot = join(stageRoot, basename(resolve(source)));
  await mkdir(layout.staging, { recursive: true });
  await mkdir(stageRoot);
  try {
    await copyPackageFiles(await collectPackageFiles(source), skillRoot);
    return { stageRoot, skillRoot };
  } catch (error) {
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function commitCandidateSnapshot(root: string, record: CandidateRecord, snapshot: StagedCandidateSnapshot): Promise<void> {
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
    await rename(snapshot.skillRoot, skillRoot);
    await syncDirectory(candidateRoot);
    await atomicWriteJson(join(candidateRoot, "candidate.json"), record);
    await rm(snapshot.stageRoot, { recursive: true, force: true });
    await syncDirectory(layout.staging);
  } catch (error) {
    await rm(candidateRoot, { recursive: true, force: true });
    await rm(snapshot.stageRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function discardCandidateSnapshot(snapshot: StagedCandidateSnapshot): Promise<void> {
  await rm(snapshot.stageRoot, { recursive: true, force: true });
}
