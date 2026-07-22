import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { brainLayout } from "./layout.js";
import { rebuildObsidianProjectionFromArtifacts } from "./obsidian-projection.js";
import type { BrainDerivedProjectionPort } from "./ports.js";
import type { BrainArtifact } from "./types.js";

export class FileObsidianProjectionManager implements BrainDerivedProjectionPort {
  private readonly dirtyPath: string;

  constructor(private readonly root: string) {
    this.dirtyPath = `${brainLayout(root).obsidianProjection}.dirty.json`;
  }

  async initialize(artifacts: readonly BrainArtifact[]): Promise<void> {
    await this.markDirty();
    await this.refresh(artifacts);
  }

  async markDirty(): Promise<void> {
    await mkdir(dirname(this.dirtyPath), { recursive: true });
    await atomicWriteFile(this.dirtyPath, JSON.stringify({
      dirty: true,
      reason: "canonical-brain-mutation"
    }), { mode: 0o600 });
  }

  async refresh(artifacts: readonly BrainArtifact[]): Promise<void> {
    await rebuildObsidianProjectionFromArtifacts(this.root, artifacts);
    await rm(this.dirtyPath, { force: true });
  }
}
