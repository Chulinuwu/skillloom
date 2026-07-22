import { basename } from "node:path";
import { BrainNotFoundError, BrainRevisionConflictError } from "./errors.js";
import { hashBrainContent } from "./hash.js";
import { authoringDocumentErrors, authoringPayloadErrors } from "./authoring-document.js";
import { isObsidianAuthorableType } from "./authoring-policy.js";
import type { AuthoringMutationResult, ParsedAuthoringDocument } from "./authoring-types.js";
import type { BrainService } from "./service.js";
import type { BrainActor, BrainArtifact, BrainJsonValue } from "./types.js";

export async function applyAuthoringDocument(input: {
  brain: BrainService;
  actor: BrainActor;
  path: string;
  contentHash: string;
  document: ParsedAuthoringDocument;
  requireTarget?: boolean;
}): Promise<AuthoringMutationResult> {
  const errors = [
    ...input.document.errors,
    ...authoringDocumentErrors(input.document.frontmatter),
    ...authoringPayloadErrors(input.document)
  ];
  const target = errors.length === 0 ? await readTarget(input, errors) : undefined;
  const type = input.document.frontmatter.type ?? target?.type ?? "note";
  if (!isObsidianAuthorableType(type)) errors.push(`type ${type} cannot be directly authored`);
  if (target !== undefined && !isObsidianAuthorableType(target.type)) errors.push(`target type ${target.type} cannot be directly authored`);
  if (input.requireTarget === true && target === undefined) errors.push("Curated documents require a canonicalArtifactId and baseRevision");
  if (errors.length > 0) return await quarantine(input, errors);
  return target === undefined ? await capture(input, type) : await update(input, target, type);
}

function authoringProvenance(
  existing: Record<string, BrainJsonValue>,
  input: { path: string; contentHash: string; document: ParsedAuthoringDocument }
): Record<string, BrainJsonValue> {
  return {
    ...existing,
    ...(input.document.frontmatter.provenance ?? {}),
    obsidianAuthoringPath: input.path,
    authoredContentHash: input.contentHash
  };
}

async function readTarget(
  input: { brain: BrainService; actor: BrainActor; document: ParsedAuthoringDocument },
  errors: string[]
): Promise<BrainArtifact | undefined> {
  const artifactId = input.document.frontmatter.canonicalArtifactId;
  if (artifactId === undefined || input.document.frontmatter.baseRevision === undefined) return undefined;
  try {
    return await input.brain.read({ actor: input.actor, artifactId });
  } catch (error) {
    if (!(error instanceof BrainNotFoundError)) throw error;
    errors.push(`canonical artifact ${artifactId} was not found`);
    return undefined;
  }
}

async function capture(
  input: { brain: BrainService; actor: BrainActor; path: string; contentHash: string; document: ParsedAuthoringDocument },
  type: BrainArtifact["type"]
): Promise<AuthoringMutationResult> {
  const artifact = await input.brain.capture({
    actor: input.actor,
    requestId: operationRequestId("capture", input.path, input.contentHash),
    type,
    title: input.document.frontmatter.title ?? basename(input.path, ".md"),
    content: input.document.content,
    frontmatter: input.document.frontmatter.frontmatter,
    provenance: authoringProvenance({}, input),
    sensitivity: input.document.frontmatter.sensitivity ?? "private"
  });
  return { status: "captured", artifact };
}

function quarantineContent(content: string): string {
  return content.length <= 100_000 ? content : `${content.slice(0, 100_000)}\n\n[truncated by Skillloom authoring quarantine]`;
}

async function update(
  input: { brain: BrainService; actor: BrainActor; path: string; contentHash: string; document: ParsedAuthoringDocument },
  target: BrainArtifact,
  type: BrainArtifact["type"]
): Promise<AuthoringMutationResult> {
  try {
    const artifact = await input.brain.update({
      actor: input.actor,
      requestId: operationRequestId("update", input.path, input.contentHash),
      artifactId: target.id,
      baseRevision: input.document.frontmatter.baseRevision ?? target.revision,
      ...(type === target.type ? {} : { type }),
      title: input.document.frontmatter.title,
      content: input.document.content,
      frontmatter: input.document.frontmatter.frontmatter,
      provenance: authoringProvenance(target.provenance, input),
      sensitivity: input.document.frontmatter.sensitivity
    });
    return { status: "updated", artifact };
  } catch (error) {
    if (!(error instanceof BrainRevisionConflictError)) throw error;
    const conflict = await input.brain.capture({
      actor: input.actor,
      requestId: operationRequestId("conflict", input.path, input.contentHash),
      type: "rejected-update",
      title: `Conflict: ${input.document.frontmatter.title ?? basename(input.path)}`,
      content: input.document.content,
      frontmatter: {
        conflict: true,
        targetArtifactId: target.id,
        attemptedBaseRevision: input.document.frontmatter.baseRevision ?? target.revision,
        currentRevision: error.currentRevision
      },
      provenance: authoringProvenance(target.provenance, input),
      details: {
        kind: "rejected-update",
        targetArtifactId: target.id,
        rejectedAt: input.document.frontmatter.stagedAt ?? input.contentHash,
        reason: "base revision changed before Obsidian authoring sync",
        retryable: true
      },
      sensitivity: input.document.frontmatter.sensitivity ?? target.sensitivity
    });
    return { status: "conflict", conflict };
  }
}

async function quarantine(
  input: { brain: BrainService; actor: BrainActor; path: string; contentHash: string; document: ParsedAuthoringDocument },
  errors: readonly string[]
): Promise<AuthoringMutationResult> {
  const conflict = await input.brain.capture({
    actor: input.actor,
    requestId: operationRequestId("quarantine", input.path, input.contentHash),
    type: "health-report",
    title: `Quarantined authoring note: ${basename(input.path)}`,
    content: quarantineContent(input.document.content),
    frontmatter: { quarantine: true, obsidianAuthoringPath: input.path, errors: [...errors] },
    provenance: authoringProvenance({}, input),
    sensitivity: input.document.frontmatter.sensitivity ?? "private"
  });
  return { status: "quarantined", conflict };
}

function operationRequestId(action: "capture" | "conflict" | "quarantine" | "update", path: string, contentHash: string): string {
  return `obsidian-authoring:${action}:${hashBrainContent(`${path}\n${contentHash}`)}`;
}
