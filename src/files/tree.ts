import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { PathPolicyError, ValidationError } from "../domain/errors.js";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "../config/defaults.js";
import type { PackageFile } from "../domain/types.js";

export async function collectPackageFiles(root: string): Promise<PackageFile[]> {
  const absoluteRoot = resolve(root);
  const files: PackageFile[] = [];
  let total = 0;
  async function visit(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new PathPolicyError(`Refusing symlink in skill package: ${toRelative(absoluteRoot, path)}`);
    }
    if (stat.isDirectory()) {
      const entries = await readdir(path);
      for (const entry of entries.sort()) {
        await visit(resolve(path, entry));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new PathPolicyError(`Refusing non-regular file: ${toRelative(absoluteRoot, path)}`);
    }
    if (stat.size > MAX_FILE_BYTES) {
      throw new ValidationError(`File exceeds size limit: ${toRelative(absoluteRoot, path)}`);
    }
    total += stat.size;
    if (total > MAX_TOTAL_BYTES) {
      throw new ValidationError("Skill package exceeds total size limit");
    }
    const relativePath = toRelative(absoluteRoot, path);
    await rejectBinary(path, relativePath);
    files.push({ absolutePath: path, relativePath, size: stat.size, mode: stat.mode });
  }
  await visit(absoluteRoot);
  return files.sort((left, right) => comparePackagePath(left.relativePath, right.relativePath));
}

export function comparePackagePath(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === "SKILL.md") {
    return -1;
  }
  if (right === "SKILL.md") {
    return 1;
  }
  return left < right ? -1 : 1;
}

function toRelative(root: string, path: string): string {
  const rel = relative(root, resolve(path));
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new PathPolicyError(`Path escapes skill package: ${path}`);
  }
  return rel.split(sep).join("/");
}

async function rejectBinary(path: string, relativePath: string): Promise<void> {
  const buffer = await readFile(path);
  if (buffer.includes(0)) {
    throw new ValidationError(`Refusing binary file: ${relativePath}`);
  }
}
