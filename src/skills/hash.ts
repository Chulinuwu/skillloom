import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PackageFile } from "../domain/types.js";

export async function hashPackage(files: PackageFile[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(Buffer.from([0]));
    hash.update(await readFile(file.absolutePath));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}
