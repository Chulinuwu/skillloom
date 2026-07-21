import { JsonlBrainAuditLog } from "./audit-log.js";
import { BrainIdempotencyConflictError, BrainNotFoundError, BrainRevisionConflictError, BrainStorageCorruptionError, BrainValidationError } from "./errors.js";
import { FileBrainSourceStore } from "./file-source-store.js";
import { deterministicBrainId, hashBrainContent, hashBrainPayload } from "./hash.js";
import { validateCaptureInput, validateLinkInput, validateUpdateInput } from "./input-validation.js";
import { createArtifactOperation, requireArtifactResult, requireLinkResult } from "./operation.js";
import { BrainOperationExecutor } from "./operation-executor.js";
import { FileBrainOperationJournal } from "./operation-journal.js";
import type {
  BrainAuditPort,
  BrainMetadataIndex,
  BrainOperationJournalPort,
  BrainPermissionPort,
  BrainServiceDependencies,
  BrainSourceStore
} from "./ports.js";
import { SqliteBrainMetadataIndex } from "./sqlite-index.js";
import type {
  BrainActor,
  BrainArtifact,
  BrainArtifactMutationResult,
  BrainLinkMutationResult,
  BrainMutationResult,
  BrainPendingOperation,
  BrainSearchResult,
  CaptureBrainInput,
  LinkBrainInput,
  SearchBrainInput,
  UpdateBrainInput
} from "./types.js";
import {
  isBrainArtifactType,
  validateActor,
  validateArtifactId,
  validateSearchQuery,
} from "./validation.js";

export class BrainService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly executor: BrainOperationExecutor;

  constructor(
    private readonly permissions: BrainPermissionPort,
    private readonly source: BrainSourceStore,
    private readonly audit: BrainAuditPort,
    private readonly journal: BrainOperationJournalPort,
    private readonly index: BrainMetadataIndex,
    private readonly clock: () => Date,
    private readonly faultInjector?: BrainServiceDependencies["faultInjector"]
  ) {
    this.executor = new BrainOperationExecutor(source, audit, journal, index, faultInjector);
  }

  async initialize(): Promise<void> {
    await this.source.initialize();
    await this.audit.initialize();
    await this.journal.initialize();
    await this.index.initialize();
    await this.executor.recoverPending();
    await this.index.rebuild(await this.source.list(), await this.audit.readAll());
  }

  async close(): Promise<void> {
    await this.index.close();
  }

  async capture(input: CaptureBrainInput): Promise<BrainArtifactMutationResult> {
    validateCaptureInput(input);
    await this.permissions.requireWrite(input.actor, "capture");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "capture",
        type: input.type,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        sensitivity: input.sensitivity
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireArtifactResult(replay);
      }
      const artifactId = deterministicBrainId("artifact", input.actor.actorId, input.requestId);
      if (await this.source.read(artifactId)) {
        throw new BrainStorageCorruptionError(`Artifact ID ${artifactId} exists without an idempotency record`);
      }
      const now = this.clock().toISOString();
      const artifact: BrainArtifact = {
        id: artifactId,
        type: input.type,
        path: `vault/inbox/${artifactId}.md`,
        revision: "1",
        contentHash: hashBrainContent(input.content),
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        sensitivity: input.sensitivity,
        createdAt: now,
        createdBy: input.actor.actorId,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      const operation = createArtifactOperation("capture", input.actor, input.requestId, payloadHash, artifact, now);
      await this.executor.prepare(operation);
      return requireArtifactResult(await this.executor.finalize(operation));
    });
  }

  async update(input: UpdateBrainInput): Promise<BrainArtifactMutationResult> {
    validateUpdateInput(input);
    await this.permissions.requireWrite(input.actor, "update");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "update",
        artifactId: input.artifactId,
        baseRevision: input.baseRevision,
        type: input.type,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter,
        provenance: input.provenance,
        sensitivity: input.sensitivity
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireArtifactResult(replay);
      }
      const current = await this.source.read(input.artifactId);
      if (!current) {
        throw new BrainNotFoundError(input.artifactId);
      }
      if (current.revision !== input.baseRevision) {
        throw new BrainRevisionConflictError(input.baseRevision, current.revision);
      }
      const indexed = await this.index.getArtifactMetadata(input.artifactId);
      if (indexed && indexed.contentHash !== current.contentHash) {
        throw new BrainRevisionConflictError(input.baseRevision, current.revision, indexed.contentHash, current.contentHash);
      }
      const now = this.clock().toISOString();
      const content = input.content ?? current.content;
      const artifact: BrainArtifact = {
        ...current,
        type: input.type ?? current.type,
        revision: (BigInt(current.revision) + 1n).toString(),
        contentHash: hashBrainContent(content),
        title: input.title ?? current.title,
        content,
        frontmatter: input.frontmatter ?? current.frontmatter,
        provenance: input.provenance ?? current.provenance,
        sensitivity: input.sensitivity ?? current.sensitivity,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      const operation = createArtifactOperation("update", input.actor, input.requestId, payloadHash, artifact, now, {
        revision: current.revision,
        contentHash: current.contentHash
      });
      await this.executor.prepare(operation);
      return requireArtifactResult(await this.executor.finalize(operation));
    });
  }

  async link(input: LinkBrainInput): Promise<BrainLinkMutationResult> {
    validateLinkInput(input);
    await this.permissions.requireWrite(input.actor, "link");
    return await this.enqueue(async () => {
      await this.executor.recoverPending();
      const payloadHash = hashBrainPayload({
        action: "link",
        sourceArtifactId: input.sourceArtifactId,
        targetArtifactId: input.targetArtifactId,
        relationship: input.relationship
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireLinkResult(replay);
      }
      if (!await this.source.read(input.sourceArtifactId)) {
        throw new BrainNotFoundError(input.sourceArtifactId);
      }
      if (!await this.source.read(input.targetArtifactId)) {
        throw new BrainNotFoundError(input.targetArtifactId);
      }
      const now = this.clock().toISOString();
      const operationId = deterministicBrainId("operation", input.actor.actorId, input.requestId);
      const linkId = deterministicBrainId("link", input.actor.actorId, input.requestId);
      const operation: BrainPendingOperation = {
        version: 1,
        operationId,
        action: "link",
        actor: input.actor,
        requestId: input.requestId,
        payloadHash,
        link: {
          id: linkId,
          sourceArtifactId: input.sourceArtifactId,
          targetArtifactId: input.targetArtifactId,
          relationship: input.relationship,
          createdAt: now,
          createdBy: input.actor.actorId
        },
        event: {
          eventId: deterministicBrainId("event", input.actor.actorId, input.requestId),
          kind: "brain.linked",
          actor: input.actor,
          resource: { kind: "brain-link", id: linkId },
          requestId: input.requestId,
          payloadHash,
          createdAt: now
        },
        createdAt: now
      };
      await this.journal.write(operation);
      return requireLinkResult(await this.executor.finalize(operation));
    });
  }

  async read(input: { actor: BrainActor; artifactId: string }): Promise<BrainArtifact> {
    validateActor(input.actor);
    validateArtifactId(input.artifactId);
    await this.permissions.requireRead(input.actor);
    const artifact = await this.source.read(input.artifactId);
    if (!artifact) {
      throw new BrainNotFoundError(input.artifactId);
    }
    return artifact;
  }

  async search(input: SearchBrainInput): Promise<BrainSearchResult[]> {
    validateActor(input.actor);
    validateSearchQuery(input.query);
    if (input.type !== undefined && !isBrainArtifactType(input.type)) {
      throw new BrainValidationError("type is not a supported brain artifact type");
    }
    await this.permissions.requireRead(input.actor);
    const requestedLimit = input.limit ?? 20;
    const limit = Math.min(50, Math.max(1, Number.isInteger(requestedLimit) ? requestedLimit : 20));
    return await this.index.search(input.query, input.type, limit);
  }

  async links(input: { actor: BrainActor; artifactId: string }) {
    validateActor(input.actor);
    validateArtifactId(input.artifactId);
    await this.permissions.requireRead(input.actor);
    if (!await this.source.read(input.artifactId)) {
      throw new BrainNotFoundError(input.artifactId);
    }
    return await this.index.links(input.artifactId);
  }

  async latestEventSequence(): Promise<string> {
    return await this.audit.latestSequence();
  }

  private async replay(actor: BrainActor, requestId: string, payloadHash: string): Promise<BrainMutationResult | null> {
    const existing = await this.index.getIdempotency(actor.actorId, requestId);
    if (!existing) {
      return null;
    }
    if (existing.payloadHash !== payloadHash) {
      throw new BrainIdempotencyConflictError(actor.actorId, requestId);
    }
    return existing.result;
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

export async function createBrainService(dependencies: BrainServiceDependencies): Promise<BrainService> {
  const service = new BrainService(
    dependencies.permissions,
    dependencies.sourceStore ?? new FileBrainSourceStore(dependencies.root),
    dependencies.audit ?? new JsonlBrainAuditLog(dependencies.root),
    dependencies.journal ?? new FileBrainOperationJournal(dependencies.root),
    dependencies.index ?? new SqliteBrainMetadataIndex(dependencies.root),
    dependencies.clock ?? (() => new Date()),
    dependencies.faultInjector
  );
  try {
    await service.initialize();
    return service;
  } catch (error) {
    await service.close();
    throw error;
  }
}
