import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { BrainRevisionConflictError } from "./errors.js";
import { hashBrainContent } from "./hash.js";
import { brainLayout } from "./layout.js";
import type { BrainService } from "./service.js";
import type { BrainActor, BrainArtifactType, BrainJsonValue, BrainSensitivity, HumanInboxImportResult } from "./types.js";
import { isBrainArtifactType, isBrainSensitivity } from "./validation.js";

type HumanInboxFrontmatter = {
  title?: string;
  type?: BrainArtifactType;
  sensitivity?: BrainSensitivity;
  targetArtifactId?: string;
  baseRevision?: string;
  provenance?: Record<string, BrainJsonValue>;
  frontmatter?: Record<string, BrainJsonValue>;
  stagedAt?: string;
};
type ParsedHumanInboxNote = {
  frontmatter: HumanInboxFrontmatter;
  content: string;
  errors: readonly string[];
};

export async function stageHumanInboxNote(root: string, input: {
  slug: string;
  title: string;
  content: string;
  type?: BrainArtifactType;
  sensitivity?: BrainSensitivity;
  targetArtifactId?: string;
  baseRevision?: string;
  provenance?: Record<string, BrainJsonValue>;
  frontmatter?: Record<string, BrainJsonValue>;
}): Promise<string> {
  const layout = brainLayout(root);
  await mkdir(layout.humanInbox, { recursive: true });
  const path = join(layout.humanInbox, `${safeSlug(input.slug)}.md`);
  await atomicWriteFile(path, serializeHumanInboxNote({
    title: input.title,
    type: input.type,
    sensitivity: input.sensitivity,
    targetArtifactId: input.targetArtifactId,
    baseRevision: input.baseRevision,
    frontmatter: input.frontmatter,
    provenance: input.provenance,
    stagedAt: new Date().toISOString()
  }, input.content), { mode: 0o600 });
  return path;
}

export async function importHumanInbox(root: string, brain: BrainService, actor: BrainActor): Promise<HumanInboxImportResult[]> {
  const layout = brainLayout(root);
  await mkdir(layout.humanInbox, { recursive: true });
  const checkpoints = await readCheckpoints(layout.humanInboxCheckpoints);
  const results: HumanInboxImportResult[] = [];
  for (const entry of await readdir(layout.humanInbox, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const path = join(layout.humanInbox, entry.name);
    const text = await readFile(path, "utf8");
    const contentHash = hashBrainContent(text);
    if (checkpoints[path] === contentHash) {
      results.push({ path, contentHash, imported: false });
      continue;
    }
    const staged = parseHumanInboxNote(text, (await stat(path)).mtime.toISOString());
    const result = await importStagedNote(brain, actor, path, contentHash, staged);
    checkpoints[path] = contentHash;
    await writeCheckpoints(layout.humanInboxCheckpoints, checkpoints);
    results.push(result);
  }
  return results;
}

function serializeHumanInboxNote(frontmatter: HumanInboxFrontmatter, content: string): string {
  return `---\n${JSON.stringify(frontmatter)}\n---\n${content}`;
}

async function importStagedNote(
  brain: BrainService,
  actor: BrainActor,
  path: string,
  contentHash: string,
  staged: ParsedHumanInboxNote
): Promise<HumanInboxImportResult> {
  const provenance = {
    ...(staged.frontmatter.provenance ?? {}),
    humanInboxPath: path,
    stagedContentHash: contentHash
  };
  const errors = [...staged.errors, ...inboxShapeErrors(staged.frontmatter)];
  if (errors.length > 0) {
    const conflict = await brain.capture({
      actor,
      requestId: operationRequestId("quarantine", path, contentHash),
      type: "health-report",
      title: `Quarantined inbox note: ${basename(path)}`,
      content: staged.content,
      frontmatter: {
        quarantine: true,
        humanInboxPath: path,
        errors
      },
      provenance,
      sensitivity: staged.frontmatter.sensitivity ?? "private"
    });
    return { path, contentHash, imported: true, conflict };
  }
  if (staged.frontmatter.targetArtifactId && staged.frontmatter.baseRevision) {
    try {
      const artifact = await brain.update({
        actor,
        requestId: operationRequestId("update", path, contentHash),
        artifactId: staged.frontmatter.targetArtifactId,
        baseRevision: staged.frontmatter.baseRevision,
        title: staged.frontmatter.title,
        content: staged.content,
        frontmatter: staged.frontmatter.frontmatter,
        provenance
      });
      return { path, contentHash, imported: true, artifact };
    } catch (error) {
      if (!(error instanceof BrainRevisionConflictError)) {
        throw error;
      }
      const conflict = await brain.capture({
        actor,
        requestId: operationRequestId("conflict", path, contentHash),
        type: "rejected-update",
        title: `Conflict: ${staged.frontmatter.title ?? basename(path)}`,
        content: staged.content,
        frontmatter: {
          conflict: true,
          targetArtifactId: staged.frontmatter.targetArtifactId,
          attemptedBaseRevision: staged.frontmatter.baseRevision,
          currentRevision: error.currentRevision
        },
        provenance,
        details: {
          kind: "rejected-update",
          targetArtifactId: staged.frontmatter.targetArtifactId,
          rejectedAt: staged.frontmatter.stagedAt ?? contentHash,
          reason: "base revision changed before human inbox import",
          retryable: true
        },
        sensitivity: staged.frontmatter.sensitivity ?? "private"
      });
      return { path, contentHash, imported: true, conflict };
    }
  }
  const artifact = await brain.capture({
    actor,
    requestId: operationRequestId("capture", path, contentHash),
    type: staged.frontmatter.type ?? "note",
    title: staged.frontmatter.title ?? basename(path, ".md"),
    content: staged.content,
    frontmatter: staged.frontmatter.frontmatter,
    provenance,
    sensitivity: staged.frontmatter.sensitivity ?? "private"
  });
  return { path, contentHash, imported: true, artifact };
}

function parseHumanInboxNote(text: string, fallbackStagedAt: string): ParsedHumanInboxNote {
  if (!text.startsWith("---\n")) {
    return { frontmatter: { stagedAt: fallbackStagedAt }, content: text, errors: [] };
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: { stagedAt: fallbackStagedAt }, content: text, errors: ["unterminated frontmatter"] };
  }
  const parsed = parseFrontmatter(text.slice(4, end));
  return {
    frontmatter: {
      ...parsed.frontmatter,
      stagedAt: parsed.frontmatter.stagedAt ?? fallbackStagedAt
    },
    content: text.slice(end + 5),
    errors: parsed.errors
  };
}

function parseFrontmatter(text: string): { frontmatter: HumanInboxFrontmatter; errors: string[] } {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? normalizeFrontmatter(value) : { frontmatter: {}, errors: ["frontmatter is not an object"] };
  } catch {
    return { frontmatter: {}, errors: ["frontmatter is not valid JSON"] };
  }
}

function normalizeFrontmatter(value: Record<string, unknown>): { frontmatter: HumanInboxFrontmatter; errors: string[] } {
  return { frontmatter: {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(isBrainArtifactType(value.type) ? { type: value.type } : {}),
    ...(isBrainSensitivity(value.sensitivity) ? { sensitivity: value.sensitivity } : {}),
    ...(typeof value.targetArtifactId === "string" ? { targetArtifactId: value.targetArtifactId } : {}),
    ...(typeof value.baseRevision === "string" ? { baseRevision: value.baseRevision } : {}),
    ...(isJsonRecord(value.provenance) ? { provenance: value.provenance } : {}),
    ...(isJsonRecord(value.frontmatter) ? { frontmatter: value.frontmatter } : {}),
    ...(typeof value.stagedAt === "string" ? { stagedAt: value.stagedAt } : {})
  }, errors: invalidFrontmatterFields(value) };
}

async function readCheckpoints(path: string): Promise<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return isStringRecord(value) ? value : {};
  } catch {
    return {};
  }
}

async function writeCheckpoints(path: string, checkpoints: Record<string, string>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, JSON.stringify(checkpoints, null, 2), { mode: 0o600 });
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}

function operationRequestId(action: "capture" | "conflict" | "quarantine" | "update", path: string, contentHash: string): string {
  return `human-inbox:${action}:${hashBrainContent(`${path}\n${contentHash}`)}`;
}

function inboxShapeErrors(frontmatter: HumanInboxFrontmatter): string[] {
  const hasTarget = frontmatter.targetArtifactId !== undefined;
  const hasBase = frontmatter.baseRevision !== undefined;
  return hasTarget === hasBase ? [] : ["targetArtifactId and baseRevision must be provided together"];
}

function invalidFrontmatterFields(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (value.title !== undefined && typeof value.title !== "string") errors.push("title must be a string");
  if (value.type !== undefined && !isBrainArtifactType(value.type)) errors.push("type is not supported");
  if (value.sensitivity !== undefined && !isBrainSensitivity(value.sensitivity)) errors.push("sensitivity is not supported");
  if (value.targetArtifactId !== undefined && typeof value.targetArtifactId !== "string") errors.push("targetArtifactId must be a string");
  if (value.baseRevision !== undefined && typeof value.baseRevision !== "string") errors.push("baseRevision must be a string");
  if (value.provenance !== undefined && !isJsonRecord(value.provenance)) errors.push("provenance must be JSON");
  if (value.frontmatter !== undefined && !isJsonRecord(value.frontmatter)) errors.push("frontmatter must be JSON");
  if (value.stagedAt !== undefined && typeof value.stagedAt !== "string") errors.push("stagedAt must be a string");
  return errors;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isJsonRecord(value: unknown): value is Record<string, BrainJsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is BrainJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
