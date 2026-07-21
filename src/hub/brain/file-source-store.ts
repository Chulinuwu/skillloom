import { access, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { syncDirectory } from "../../files/durability.js";
import { BrainRevisionConflictError, BrainStorageCorruptionError } from "./errors.js";
import { brainLayout } from "./layout.js";
import { parseBrainMarkdown, serializeBrainMarkdown } from "./markdown.js";
import type { BrainSourceStore } from "./ports.js";
import type { BrainArtifact, BrainArtifactBase } from "./types.js";
import { validateArtifactId } from "./validation.js";

export class FileBrainSourceStore implements BrainSourceStore {
  private readonly layout;
  private readonly paths = new Map<string, string>();

  constructor(private readonly root: string) {
    this.layout = brainLayout(root);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.layout.inbox, { recursive: true }),
      mkdir(this.layout.curated, { recursive: true }),
      mkdir(this.layout.staging, { recursive: true })
    ]);
    await this.list();
  }

  async stage(operationId: string, artifact: BrainArtifact): Promise<void> {
    validateArtifactId(operationId);
    this.resolveArtifactPath(artifact);
    await atomicWriteFile(this.stagedPath(operationId), serializeBrainMarkdown(artifact), { mode: 0o600 });
  }

  async commit(operationId: string, artifact: BrainArtifact, base?: BrainArtifactBase): Promise<void> {
    validateArtifactId(operationId);
    const finalPath = this.resolveArtifactPath(artifact);
    const committed = await this.readPath(finalPath);
    if (committed
      && committed.id === artifact.id
      && committed.revision === artifact.revision
      && committed.contentHash === artifact.contentHash) {
      await this.cleanupStage(operationId);
      this.paths.set(artifact.id, finalPath);
      return;
    }
    if (!await this.hasStaged(operationId)) {
      throw new BrainStorageCorruptionError(`Pending operation ${operationId} has neither staged nor committed content`);
    }
    if (base && (!committed || committed.revision !== base.revision || committed.contentHash !== base.contentHash)) {
      throw new BrainRevisionConflictError(
        base.revision,
        committed?.revision ?? "0",
        base.contentHash,
        committed?.contentHash
      );
    }
    if (!base && committed) {
      throw new BrainStorageCorruptionError(`Capture target ${artifact.id} already exists`);
    }
    await mkdir(dirname(finalPath), { recursive: true });
    await rename(this.stagedPath(operationId), finalPath);
    await syncDirectory(dirname(finalPath));
    this.paths.set(artifact.id, finalPath);
  }

  async read(artifactId: string): Promise<BrainArtifact | null> {
    validateArtifactId(artifactId);
    let path = this.paths.get(artifactId);
    if (!path) {
      await this.list();
      path = this.paths.get(artifactId);
    }
    return path ? await this.readPath(path) : null;
  }

  async list(): Promise<BrainArtifact[]> {
    const artifacts: BrainArtifact[] = [];
    this.paths.clear();
    for (const directory of [this.layout.inbox, this.layout.curated]) {
      for (const path of await markdownFiles(directory)) {
        const artifact = await this.readPath(path);
        if (!artifact) {
          continue;
        }
        const expectedPath = relative(this.root, path).split(sep).join("/");
        if (artifact.path !== expectedPath) {
          throw new BrainStorageCorruptionError(`Artifact ${artifact.id} path metadata does not match ${expectedPath}`);
        }
        if (this.paths.has(artifact.id)) {
          throw new BrainStorageCorruptionError(`Duplicate brain artifact ID ${artifact.id}`);
        }
        this.paths.set(artifact.id, path);
        artifacts.push(artifact);
      }
    }
    return artifacts;
  }

  async hasStaged(operationId: string): Promise<boolean> {
    try {
      await access(this.stagedPath(operationId));
      return true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async cleanupStage(operationId: string): Promise<void> {
    await rm(this.stagedPath(operationId), { force: true });
    await syncDirectory(this.layout.staging);
  }

  async cleanupOrphanStages(activeOperationIds: ReadonlySet<string>): Promise<void> {
    for (const entry of await readdir(this.layout.staging, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const operationId = entry.name.slice(0, -3);
      if (!activeOperationIds.has(operationId)) {
        await rm(join(this.layout.staging, entry.name), { force: true });
      }
    }
    await syncDirectory(this.layout.staging);
  }

  private stagedPath(operationId: string): string {
    validateArtifactId(operationId);
    return join(this.layout.staging, `${operationId}.md`);
  }

  private resolveArtifactPath(artifact: BrainArtifact): string {
    validateArtifactId(artifact.id);
    const resolved = resolve(this.root, artifact.path);
    const rootPrefix = `${resolve(this.root)}${sep}`;
    if (!resolved.startsWith(rootPrefix)) {
      throw new BrainStorageCorruptionError(`Artifact ${artifact.id} escapes the brain root`);
    }
    const relativePath = relative(this.root, resolved).split(sep).join("/");
    if (!relativePath.startsWith("vault/inbox/") && !relativePath.startsWith("vault/curated/")) {
      throw new BrainStorageCorruptionError(`Artifact ${artifact.id} is outside the managed vault`);
    }
    return resolved;
  }

  private async readPath(path: string): Promise<BrainArtifact | null> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return null;
      }
      throw error;
    }
    return parseBrainMarkdown(text);
  }
}

async function markdownFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await markdownFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(path);
    }
  }
  return paths.sort();
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
