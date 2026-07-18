import { chmod, copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PackageFile } from "../domain/types.js";
import { normalizePackageMode } from "../skills/mode.js";

export async function copyPackageFiles(files: PackageFile[], destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination);
  try {
    for (const file of files) {
      const target = join(destination, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file.absolutePath, target);
      await chmod(target, normalizePackageMode(file.mode));
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
