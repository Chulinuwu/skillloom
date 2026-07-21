import { RegistryValidationError } from "./errors.js";
import { FileRegistryOperationJournal } from "./operation-journal.js";
import { RegistryPackageStager } from "./package-staging.js";
import { FileRegistryStore } from "./registry-store.js";
import {
  RegistryDivergenceError,
  RegistryIdempotencyConflictError,
  RegistryNotFoundError,
  RegistryPublishBlockedError,
  RegistryStorageCorruptionError
} from "./server-errors.js";
import { deterministicRegistryId, hashRegistryPayload } from "./server-hash.js";
import type {
  ProposeRegistryInput,
  PublishRegistryInput,
  RegistryCandidateRecord,
  RegistryIdempotencyRecord,
  RegistryPendingOperation,
  RegistryProposalResult,
  RegistryPublishResult,
  RegistryServiceDependencies
} from "./server-types.js";
import { validateRegistryProposal, validateRegistryPublish } from "./server-validation.js";
import { parseChannelManifest, parseRegistryCandidate, parseRegistryRelease } from "./schema.js";
import type { ChannelManifest, PackageBlobV1, RegistryRelease, SignedRegistryPayload } from "./types.js";
import { signRegistryPayload } from "./release-signature.js";

export class RegistryService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly store: FileRegistryStore;
  private readonly journal: FileRegistryOperationJournal;
  private readonly stager: RegistryPackageStager;

  constructor(private readonly dependencies: RegistryServiceDependencies) {
    this.store = new FileRegistryStore(dependencies.root);
    this.journal = new FileRegistryOperationJournal(dependencies.root);
    this.stager = new RegistryPackageStager(dependencies.root);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    await this.journal.initialize();
    await this.stager.initialize();
    await this.recoverPending();
    await this.store.assertReferencesComplete();
  }

  async propose(input: ProposeRegistryInput): Promise<RegistryProposalResult> {
    await this.dependencies.permissions.requirePropose(input.actor);
    return await this.enqueue(async () => {
      await this.recoverPending();
      const payloadHash = hashRegistryPayload({
        action: "propose",
        name: input.name,
        packageBlob: input.packageBlob,
        claimedPackageHash: input.claimedPackageHash,
        baseReleaseHash: input.baseReleaseHash,
        capabilities: input.capabilities,
        provenance: input.provenance
      });
      const replay = await this.replay(input.actor.actorId, input.requestId, payloadHash, "propose");
      if (replay) return replay.result;
      const validated = await validateRegistryProposal(this.stager, input);
      const current = await this.currentRelease(input.name, "stable");
      const divergence = divergenceFor(input.baseReleaseHash, current?.payload.packageHash ?? null);
      const now = (this.dependencies.clock ?? (() => new Date()))().toISOString();
      const candidateId = deterministicRegistryId("candidate", input.actor.actorId, input.requestId);
      const candidate = parseRegistryCandidate({
        schemaVersion: "skillloom-registry-candidate-v1",
        hubInstanceId: this.dependencies.hubInstanceId,
        sequence: await this.store.nextSequence(),
        candidateId,
        name: input.name,
        packageHash: validated.report.packageHash,
        baseReleaseHash: input.baseReleaseHash,
        divergence,
        supersession: { state: "active" },
        provenance: input.provenance,
        capabilities: validated.report.capabilities,
        validationDigest: validated.report.validationDigest,
        createdAt: now,
        createdBy: input.actor.actorId
      });
      const result: RegistryCandidateRecord = {
        candidate: signRegistryPayload(this.dependencies.signer, candidate),
        validation: validated.report
      };
      const operation: RegistryPendingOperation = {
        schemaVersion: "skillloom-registry-operation-v1",
        operationId: deterministicRegistryId("operation", input.actor.actorId, input.requestId),
        action: "propose",
        actorId: input.actor.actorId,
        requestId: input.requestId,
        payloadHash,
        packageBlob: validated.blob,
        result,
        createdAt: now
      };
      await this.journal.write(operation);
      await this.dependencies.faultInjector?.("afterIntent", operation);
      return await this.finalizeProposal(operation);
    });
  }

  async publish(input: PublishRegistryInput): Promise<RegistryPublishResult> {
    validateRegistryPublish(input);
    await this.dependencies.permissions.requirePublish(input.actor);
    return await this.enqueue(async () => {
      await this.recoverPending();
      const payloadHash = hashRegistryPayload({
        action: "publish",
        candidateId: input.candidateId,
        version: input.version,
        channel: input.channel
      });
      const replay = await this.replay(input.actor.actorId, input.requestId, payloadHash, "publish");
      if (replay) return replay.result;
      const record = await this.store.readCandidate(input.candidateId);
      if (!record) throw new RegistryNotFoundError(`candidate:${input.candidateId}`);
      if (record.candidate.payload.divergence.state === "divergent") throw new RegistryDivergenceError(input.candidateId);
      if (record.validation.findings.some((finding) => finding.severity === "danger")) throw new RegistryPublishBlockedError(input.candidateId);
      const current = await this.currentRelease(record.candidate.payload.name, input.channel);
      assertPublishBase(record, current?.payload.packageHash ?? null);
      if (!await this.store.readBlob(record.candidate.payload.packageHash)) {
        throw new RegistryStorageCorruptionError(`Candidate ${input.candidateId} points to a missing blob`);
      }
      const now = (this.dependencies.clock ?? (() => new Date()))().toISOString();
      const sequence = await this.store.nextSequence();
      const release = parseRegistryRelease({
        schemaVersion: "skillloom-registry-release-v1",
        hubInstanceId: this.dependencies.hubInstanceId,
        sequence,
        releaseId: deterministicRegistryId("release", input.actor.actorId, input.requestId),
        name: record.candidate.payload.name,
        version: input.version,
        channel: input.channel,
        packageHash: record.candidate.payload.packageHash,
        sourceCandidateId: input.candidateId,
        provenance: record.candidate.payload.provenance,
        capabilities: record.candidate.payload.capabilities,
        validationDigest: record.candidate.payload.validationDigest,
        supersedesReleaseHash: current?.payload.packageHash ?? null,
        createdAt: now,
        createdBy: input.actor.actorId
      });
      const previousManifest = await this.store.readManifest(input.channel);
      const releases = [
        ...(previousManifest?.payload.releases ?? []).filter((item) => item.name !== release.name),
        {
          releaseId: release.releaseId,
          releaseSequence: release.sequence,
          name: release.name,
          version: release.version,
          packageHash: release.packageHash
        }
      ].sort((left, right) => left.name.localeCompare(right.name));
      const manifest = parseChannelManifest({
        schemaVersion: "skillloom-channel-manifest-v1",
        hubInstanceId: this.dependencies.hubInstanceId,
        sequence,
        channel: input.channel,
        releases,
        generatedAt: now
      });
      const result: RegistryPublishResult = {
        release: signRegistryPayload(this.dependencies.signer, release),
        manifest: signRegistryPayload(this.dependencies.signer, manifest)
      };
      const operation: RegistryPendingOperation = {
        schemaVersion: "skillloom-registry-operation-v1",
        operationId: deterministicRegistryId("operation", input.actor.actorId, input.requestId),
        action: "publish",
        actorId: input.actor.actorId,
        requestId: input.requestId,
        payloadHash,
        result,
        createdAt: now
      };
      await this.journal.write(operation);
      await this.dependencies.faultInjector?.("afterIntent", operation);
      return await this.finalizePublish(operation);
    });
  }

  async getCandidate(candidateId: string): Promise<RegistryCandidateRecord> {
    const record = await this.store.readCandidate(candidateId);
    if (!record) throw new RegistryNotFoundError(`candidate:${candidateId}`);
    return record;
  }

  async readBlob(packageHash: string): Promise<PackageBlobV1 | null> {
    return await this.store.readBlob(packageHash);
  }

  async readRelease(releaseId: string): Promise<SignedRegistryPayload<RegistryRelease> | null> {
    return await this.store.readRelease(releaseId);
  }

  async readManifest(channel: string): Promise<SignedRegistryPayload<ChannelManifest> | null> {
    return await this.store.readManifest(channel);
  }

  private async finalizeProposal(operation: Extract<RegistryPendingOperation, { action: "propose" }>): Promise<RegistryProposalResult> {
    await this.store.writeBlob(operation.result.candidate.payload.packageHash, operation.packageBlob);
    await this.dependencies.faultInjector?.("afterBlob", operation);
    await this.store.writeCandidate(operation.result);
    await this.dependencies.faultInjector?.("afterCandidate", operation);
    await this.store.writeIdempotency(idempotency(operation));
    await this.dependencies.faultInjector?.("afterIdempotency", operation);
    await this.journal.remove(operation.operationId);
    return operation.result;
  }

  private async finalizePublish(operation: Extract<RegistryPendingOperation, { action: "publish" }>): Promise<RegistryPublishResult> {
    await this.store.writeRelease(operation.result.release);
    await this.dependencies.faultInjector?.("afterRelease", operation);
    await this.store.writeManifest(operation.result.manifest);
    await this.dependencies.faultInjector?.("afterManifest", operation);
    await this.store.writeIdempotency(idempotency(operation));
    await this.dependencies.faultInjector?.("afterIdempotency", operation);
    await this.journal.remove(operation.operationId);
    return operation.result;
  }

  private async recoverPending(): Promise<void> {
    for (const operation of await this.journal.list()) {
      if (operation.action === "propose") await this.finalizeProposal(operation);
      else await this.finalizePublish(operation);
    }
  }

  private async replay(actorId: string, requestId: string, payloadHash: string, action: "propose"): Promise<Extract<RegistryIdempotencyRecord, { action: "propose" }> | null>;
  private async replay(actorId: string, requestId: string, payloadHash: string, action: "publish"): Promise<Extract<RegistryIdempotencyRecord, { action: "publish" }> | null>;
  private async replay(actorId: string, requestId: string, payloadHash: string, action: RegistryIdempotencyRecord["action"]): Promise<RegistryIdempotencyRecord | null> {
    const existing = await this.store.readIdempotency(actorId, requestId);
    if (!existing) return null;
    if (existing.payloadHash !== payloadHash || existing.action !== action) {
      throw new RegistryIdempotencyConflictError(actorId, requestId);
    }
    return existing;
  }

  private async currentRelease(name: string, channel: string) {
    const manifest = await this.store.readManifest(channel);
    const reference = manifest?.payload.releases.find((item) => item.name === name);
    if (!reference) return null;
    const release = await this.store.readRelease(reference.releaseId);
    if (!release) throw new RegistryStorageCorruptionError(`Manifest references missing release ${reference.releaseId}`);
    return release;
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue = previous.then(() => current, () => current);
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export async function createRegistryService(dependencies: RegistryServiceDependencies): Promise<RegistryService> {
  if (dependencies.hubInstanceId.trim().length === 0) throw new RegistryValidationError("hubInstanceId is required");
  const service = new RegistryService(dependencies);
  await service.initialize();
  return service;
}

function divergenceFor(baseReleaseHash: string | null, currentReleaseHash: string | null) {
  if (currentReleaseHash === null) {
    if (baseReleaseHash !== null) throw new RegistryDivergenceError("new-candidate-with-stale-base");
    return { state: "aligned" as const };
  }
  if (baseReleaseHash === null) throw new RegistryValidationError("baseReleaseHash is required when a stable release exists");
  return baseReleaseHash === currentReleaseHash
    ? { state: "aligned" as const }
    : { state: "divergent" as const, currentReleaseHash };
}

function assertPublishBase(record: RegistryCandidateRecord, currentReleaseHash: string | null): void {
  if (record.candidate.payload.baseReleaseHash !== currentReleaseHash) {
    throw new RegistryDivergenceError(record.candidate.payload.candidateId);
  }
}

function idempotency(operation: RegistryPendingOperation): RegistryIdempotencyRecord {
  const common = {
    schemaVersion: "skillloom-registry-idempotency-v1" as const,
    actorId: operation.actorId,
    requestId: operation.requestId,
    payloadHash: operation.payloadHash
  };
  return operation.action === "propose"
    ? { ...common, action: "propose", result: operation.result }
    : { ...common, action: "publish", result: operation.result };
}
