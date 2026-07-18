import { realpath } from "node:fs/promises";
import { canonicalizeFuturePath } from "../adapters/physical-path.js";
import { PromotionPolicyError } from "../domain/errors.js";
import type { CandidateBase } from "../domain/types.js";
import type { MutationObservation } from "../operations/mutation-layout.js";
import type { PromotionCheckpointTarget } from "../operations/types.js";
import { hashSkillDirectory, pathExists } from "./files.js";

export async function assertBaseState(base: CandidateBase, destinations: string[]): Promise<void> {
  if (base.kind === "none") {
    return;
  }
  try {
    if (await realpath(base.path) !== base.path || await hashSkillDirectory(base.path, base.hash) !== base.hash) {
      throw new PromotionPolicyError(`Captured base path hash mismatch at ${base.path}`);
    }
  } catch (error) {
    if (error instanceof PromotionPolicyError) {
      throw error;
    }
    throw new PromotionPolicyError(`Captured base path hash mismatch at ${base.path}`);
  }
  for (const destination of destinations) {
    if (await pathExists(destination) && await hashSkillDirectory(destination, base.hash) !== base.hash) {
      throw new PromotionPolicyError(`Installed base hash mismatch at ${destination}`);
    }
  }
}

export async function assertResumeBaseState(
  base: CandidateBase,
  targets: PromotionCheckpointTarget[],
  observations: ReadonlyMap<string, MutationObservation>
): Promise<void> {
  if (base.kind === "none") {
    return;
  }
  const canonicalBasePath = await canonicalizeFuturePath(base.path);
  const matchingTargets: PromotionCheckpointTarget[] = [];
  for (const target of targets) {
    if (await canonicalizeFuturePath(target.destination) === canonicalBasePath) {
      matchingTargets.push(target);
    }
  }
  if (matchingTargets.length === 0) {
    await assertBaseState(base, []);
    return;
  }
  if (matchingTargets.length !== 1) {
    throw baseMismatch(base.path);
  }
  const target = matchingTargets[0];
  if (!target.before || target.before.kind !== "present" || target.before.hash !== base.hash) {
    throw baseMismatch(base.path);
  }
  const observation = observations.get(target.destination);
  if (!observation) {
    throw baseMismatch(base.path);
  }
  if (observation.layout === "prepared") {
    await assertBaseState(base, []);
  }
}

function baseMismatch(path: string): PromotionPolicyError {
  return new PromotionPolicyError(`Captured base path hash mismatch at ${path}`);
}
