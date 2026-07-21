import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncDirectory } from "../../files/durability.js";
import { parsePackageBlob } from "./package-blob.js";
import { registryLayout } from "./registry-layout.js";
import type { PackageBlobV1 } from "./types.js";

export class RegistryPackageStager {
  private readonly directory: string;

  constructor(root: string) {
    this.directory = join(registryLayout(root).operations, "staging");
  }

  async initialize(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true });
    await syncDirectory(dirname(this.directory));
  }

  async withMaterialized<T>(input: unknown, fn: (root: string, blob: PackageBlobV1) => Promise<T>): Promise<T> {
    const blob = parsePackageBlob(input);
    const stage = await mkdtemp(join(this.directory, "validate-"));
    try {
      for (const file of blob.files) {
        const path = join(stage, ...file.relativePath.split("/"));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, Buffer.from(file.contentBase64, "base64"), { flag: "wx", mode: file.mode });
        await chmod(path, file.mode);
      }
      return await fn(stage, blob);
    } finally {
      await rm(stage, { recursive: true, force: true });
      await syncDirectory(this.directory);
    }
  }
}
