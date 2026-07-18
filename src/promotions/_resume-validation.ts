import { basename, dirname, join } from "node:path";
import { getGenericAdapter, getScopedAdapter } from "../adapters/registry.js";
import { canonicalizeFuturePath } from "../adapters/physical-path.js";
import { ValidationError } from "../domain/errors.js";
import type { PromotionTargetRecord } from "../domain/types.js";
import { observeMutation, type MutationObservation } from "../operations/mutation-layout.js";
import type { PromotionCheckpointTarget, PromotionOperation } from "../operations/types.js";
import { readEvents } from "../store/journal.js";
import { storeLayout } from "../store/layout.js";
import { assertPromotionFindings, verifyPromotionCandidate } from "./_policy.js";
import { assertSafeDestinations } from "./_targets.js";
import { assertResumeBaseState } from "./_base-policy.js";
import { hashSkillDirectory, pathExists } from "./files.js";
import type { PromotionTarget, ResolvedPromotionTarget } from "./types.js";

export async function verifyResumeCheckpoint(root: string, checkpoint: PromotionOperation): Promise<PromotionOperation> {
  const { validation, candidate } = await verifyPromotionCandidate(root, checkpoint.candidateId);
  assertPromotionFindings(validation.findings, true);
  if (validation.packageHash !== checkpoint.candidateHash) {
    throw new ValidationError("Resume candidate hash mismatch");
  }
  if (checkpoint.targets.length === 0) {
    throw new ValidationError("Resume checkpoint has no targets");
  }
  const targets = checkpoint.targets.map(toResolvedTarget);
  const canonicalStoreRoot = await canonicalizeFuturePath(storeLayout(root).root);
  assertSafeDestinations(canonicalStoreRoot, targets);
  await verifyJournalEvidence(root, checkpoint);
  const observations = new Map<string, MutationObservation>();
  for (const target of checkpoint.targets) {
    observations.set(target.destination, await verifyTarget(target, checkpoint.promotionId));
  }
  await assertResumeBaseState(candidate.base ?? { kind: "none" }, checkpoint.targets, observations);
  return checkpoint;
}

export function toResumeRecord(target: PromotionCheckpointTarget): PromotionTargetRecord {
  if (!target.before) {
    throw new ValidationError(`Resume before-state is missing: ${target.destination}`);
  }
  return { target: target.target, scope: target.scope, destination: target.destination, before: target.before, afterHash: target.afterHash };
}

export function toResolvedTarget(target: PromotionCheckpointTarget): ResolvedPromotionTarget {
  const request: PromotionTarget = target.target === "generic"
    ? { adapter: getGenericAdapter(), destinationRoot: dirname(target.destination) }
    : { adapter: getScopedAdapter(target.target), scope: target.scope === "user" ? "user" : "project" };
  return { request, scope: target.scope, destination: target.destination, stagePath: target.stagePath, displacedPath: target.displacedPath };
}

async function verifyJournalEvidence(root: string, checkpoint: PromotionOperation): Promise<void> {
  const events = (await readEvents(root)).filter((event) => event.operationId === checkpoint.operationId);
  const staged = events.filter((event) => event.kind === "promote" && event.phase === "staged").map((event) => event.evidence);
  const backedUp = events.filter((event) => event.kind === "promote" && event.phase === "backed-up").map((event) => event.evidence);
  const expectedStages = checkpoint.targets.map((target) => ({
    target: target.target,
    scope: target.scope,
    destination: target.destination,
    stagePath: target.stagePath,
    packageHash: target.afterHash
  }));
  if (JSON.stringify(staged) !== JSON.stringify(expectedStages) || JSON.stringify(backedUp) !== JSON.stringify(checkpoint.targets.map(toResumeRecord))) {
    throw new ValidationError("Resume checkpoint does not agree with journal evidence");
  }
}

async function verifyTarget(target: PromotionCheckpointTarget, promotionId: string): Promise<MutationObservation> {
  if (!target.before) {
    throw new ValidationError(`Resume before-state is missing: ${target.destination}`);
  }
  const prefix = `.${basename(target.destination)}.skillloom-${promotionId}`;
  if (target.stagePath !== join(dirname(target.destination), `${prefix}.stage`) || target.displacedPath !== join(dirname(target.destination), `${prefix}.previous`)) {
    throw new ValidationError(`Resume temporary path mismatch: ${target.destination}`);
  }
  if (target.before.kind === "present") {
    if (!await pathExists(target.before.backupPath) || await hashSkillDirectory(target.before.backupPath) !== target.before.hash) {
      throw new ValidationError(`Resume backup hash mismatch: ${target.destination}`);
    }
  }
  if (await pathExists(target.stagePath) && await hashSkillDirectory(target.stagePath) !== target.afterHash) {
    throw new ValidationError(`Resume staged hash mismatch: ${target.destination}`);
  }
  return await observeMutation(target, {
    beforeHash: target.before.kind === "present" ? target.before.hash : null,
    afterHash: target.afterHash
  }, target.state);
}
