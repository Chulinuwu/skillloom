import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PackageFile } from "../domain/types.js";
import { normalizePackageMode } from "./mode.js";

const MODE_AWARE_HASH_PREFIX = "sha256-v2:";

export async function hashPackage(files: PackageFile[]): Promise<string> {
  return `${MODE_AWARE_HASH_PREFIX}${await digestPackage(files, true)}`;
}

export function isModeAwarePackageHash(packageHash: string): boolean {
  return packageHash.startsWith(MODE_AWARE_HASH_PREFIX);
}

export async function hashPackageForExpected(files: PackageFile[], expectedHash: string): Promise<string> {
  return isModeAwarePackageHash(expectedHash) ? await hashPackage(files) : await digestPackage(files, false);
}

async function digestPackage(files: PackageFile[], includeMode: boolean): Promise<string> {
  const hash = createHash("sha256");
  if (includeMode) {
    hash.update("skillloom-package-v2");
    hash.update(Buffer.from([0]));
  }
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(Buffer.from([0]));
    if (includeMode) {
      hash.update(normalizePackageMode(file.mode).toString(8).padStart(3, "0"));
      hash.update(Buffer.from([0]));
    }
    hash.update(await readFile(file.absolutePath));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}
