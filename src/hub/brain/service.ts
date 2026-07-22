import { JsonlBrainAuditLog } from "./audit-log.js";
import { BrainIdempotencyConflictError, BrainImmutableSourceError, BrainNotFoundError, BrainRevisionConflictError, BrainSourceSensitivityMismatchError, BrainStorageCorruptionError, BrainValidationError } from "./errors.js";
import { FileBrainSourceStore } from "./file-source-store.js";
import { deterministicBrainId, hashBrainContent, hashBrainPayload } from "./hash.js";
import { validateCaptureInput, validateLinkInput, validateUpdateInput } from "./input-validation.js";
import { createArtifactOperation, requireArtifactResult, requireLinkResult } from "./operation.js";
import { BrainOperationExecutor } from "./operation-executor.js";
import { FileBrainOperationJournal } from "./operation-journal.js";
import { validateRetrievalInput } from "./retrieval-input-validation.js";
import { BrainRetrievalService } from "./retrieval-service.js";
import type {
  BrainAuditPort,
  BrainDerivedProjectionPort,
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
  ListBrainInput,
  SearchBrainInput,
  UpdateBrainInput
} from "./types.js";
import type { BrainHealthReport, BrainRetrievalResult, RetrieveBrainInput } from "./retrieval-types.js";
import {
  isBrainArtifactType,
  parseBrainArtifact,
  validateActor,
  validateArtifactId,
  validateSearchQuery,
} from "./validation.js";
import { defaultBrainLayer } from "./vocabulary.js";

export class BrainService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly executor: BrainOperationExecutor;
  private readonly retrieval: BrainRetrievalService;

  constructor(
    private readonly permissions: BrainPermissionPort,
    private readonly source: BrainSourceStore,
    private readonly audit: BrainAuditPort,
    private readonly journal: BrainOperationJournalPort,
    private readonly index: BrainMetadataIndex,
    private readonly projection: BrainDerivedProjectionPort | undefined,
    private readonly clock: () => Date,
    private readonly faultInjector?: BrainServiceDependencies["faultInjector"]
  ) {
    this.executor = new BrainOperationExecutor(source, audit, journal, index, faultInjector);
    this.retrieval = new BrainRetrievalService(source, audit, index, clock);
  }

  async initialize(): Promise<void> {
    await this.source.initialize();
    await this.audit.initialize();
    await this.journal.initialize();
    await this.index.initialize();
    await this.executor.recoverPending();
    const artifacts = await this.source.list();
    await this.index.rebuild(artifacts, await this.audit.readAll());
    await this.initializeProjection(artifacts);
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
        layer: input.layer,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        source: input.source,
        details: input.details ?? { kind: "none" },
        sensitivity: input.sensitivity
      });
      const replay = await this.replay(input.actor, input.requestId, payloadHash);
      if (replay) {
        return requireArtifactResult(replay);
      }
      const contentHash = hashBrainContent(input.content);
      const existingSource = input.type === "source" ? await this.findSourceByContentHash(contentHash) : null;
      if (existingSource) {
        if (existingSource.sensitivity !== input.sensitivity) {
          throw new BrainSourceSensitivityMismatchError(contentHash);
        }
        const operation = createArtifactOperation("capture", input.actor, input.requestId, payloadHash, existingSource, this.clock().toISOString());
        await this.projection?.markDirty();
        await this.executor.prepare(operation);
        const result = requireArtifactResult(await this.executor.finalize(operation));
        await this.refreshProjection();
        return result;
      }
      const artifactId = input.type === "source"
        ? deterministicBrainId("source-artifact", "content", contentHash)
        : deterministicBrainId("artifact", input.actor.actorId, input.requestId);
      if (await this.source.read(artifactId)) {
        throw new BrainStorageCorruptionError(`Artifact ID ${artifactId} exists without an idempotency record`);
      }
      const now = this.clock().toISOString();
      const artifact: BrainArtifact = {
        id: artifactId,
        type: input.type,
        layer: input.layer ?? defaultBrainLayer(input.type),
        path: `vault/inbox/${artifactId}.md`,
        revision: "1",
        contentHash,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter ?? {},
        provenance: input.provenance,
        ...(input.source === undefined ? {} : { source: input.source }),
        details: input.details ?? { kind: "none" },
        sensitivity: input.sensitivity,
        createdAt: now,
        createdBy: input.actor.actorId,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      const operation = createArtifactOperation("capture", input.actor, input.requestId, payloadHash, artifact, now);
      await this.projection?.markDirty();
      await this.executor.prepare(operation);
      const result = requireArtifactResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
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
        layer: input.layer,
        title: input.title,
        content: input.content,
        frontmatter: input.frontmatter,
        provenance: input.provenance,
        details: input.details,
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
      if (immutableSourceType(current.type) || (input.type !== undefined && immutableSourceType(input.type))) {
        throw new BrainImmutableSourceError(input.artifactId);
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
      const type = input.type ?? current.type;
      const details = input.details ?? (input.type === undefined ? current.details : { kind: "none" });
      const artifact: BrainArtifact = {
        ...current,
        type,
        layer: input.layer ?? (input.type === undefined ? current.layer : defaultBrainLayer(type)),
        revision: (BigInt(current.revision) + 1n).toString(),
        contentHash: hashBrainContent(content),
        title: input.title ?? current.title,
        content,
        frontmatter: input.frontmatter ?? current.frontmatter,
        provenance: input.provenance ?? current.provenance,
        details,
        sensitivity: input.sensitivity ?? current.sensitivity,
        updatedAt: now,
        updatedBy: input.actor.actorId
      };
      validateMergedArtifact(artifact);
      const operation = createArtifactOperation("update", input.actor, input.requestId, payloadHash, artifact, now, {
        revision: current.revision,
        contentHash: current.contentHash
      });
      await this.projection?.markDirty();
      await this.executor.prepare(operation);
      const result = requireArtifactResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
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
      await this.projection?.markDirty();
      await this.journal.write(operation);
      const result = requireLinkResult(await this.executor.finalize(operation));
      await this.refreshProjection();
      return result;
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
  async retrieve(input: RetrieveBrainInput): Promise<BrainRetrievalResult> {
    validateActor(input.actor);
    validateSearchQuery(input.query);
    validateRetrievalInput(input);
    await this.permissions.requireRead(input.actor);
    return await this.retrieval.retrieve(input);
  }
  async health(input: { actor: BrainActor }): Promise<BrainHealthReport> {
    validateActor(input.actor);
    await this.permissions.requireRead(input.actor);
    return await this.retrieval.health();
  }
  async list(input: ListBrainInput) {
    validateActor(input.actor);
    if (input.type !== undefined && !isBrainArtifactType(input.type)) {
      throw new BrainValidationError("type is not a supported brain artifact type");
    }
    await this.permissions.requireRead(input.actor);
    const artifacts = await this.source.list();
    return artifacts
      .filter((artifact) => input.type === undefined || artifact.type === input.type)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id));
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

  private async findSourceByContentHash(contentHash: string): Promise<BrainArtifact | null> {
    return (await this.source.list()).find((artifact) => artifact.type === "source" && artifact.contentHash === contentHash) ?? null;
  }

  private async refreshProjection(): Promise<void> {
    try {
      await this.projection?.refresh(await this.source.list());
    } catch {
      return;
    }
  }

  private async initializeProjection(artifacts: readonly BrainArtifact[]): Promise<void> {
    try {
      await this.projection?.initialize(artifacts);
    } catch {
      try {
        await this.projection?.markDirty();
      } catch {
        return;
      }
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
    dependencies.projection,
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

function validateMergedArtifact(artifact: BrainArtifact): void {
  try {
    parseBrainArtifact(artifact);
  } catch {
    throw new BrainValidationError("typed brain metadata is malformed");
  }
}

function immutableSourceType(type: BrainArtifact["type"]): boolean {
  return type === "source" || type === "source-observation";
}
