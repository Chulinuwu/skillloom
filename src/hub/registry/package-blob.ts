import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "../../config/defaults.js";
import type { PackageFile } from "../../domain/types.js";
import { comparePackagePath } from "../../files/tree.js";
import { hashPackage } from "../../skills/hash.js";
import { RegistryPackageError } from "./errors.js";
import type { PackageBlobFileV1, PackageBlobV1 } from "./types.js";

export type PackageBlobInputFile = Readonly<{
  relativePath: string;
  mode: number;
  content: Uint8Array;
}>;

export function createPackageBlob(files: readonly PackageBlobInputFile[]): PackageBlobV1 {
  return parsePackageBlob({
    schemaVersion: "skillloom-package-blob-v1",
    files: files.map((file) => ({
      relativePath: file.relativePath,
      mode: file.mode,
      contentBase64: Buffer.from(file.content).toString("base64")
    }))
  });
}

export function parsePackageBlob(value: unknown): PackageBlobV1 {
  const record = strictRecord(value, ["schemaVersion", "files"], "package blob");
  if (record.schemaVersion !== "skillloom-package-blob-v1") throw new RegistryPackageError("Unsupported package blob schemaVersion");
  if (!Array.isArray(record.files) || record.files.length === 0) throw new RegistryPackageError("Package blob files must be a non-empty array");
  if (record.files.length > 256) throw new RegistryPackageError("Package blob exceeds file-count size limit");
  let totalBytes = 0;
  const paths = new Set<string>();
  const files = record.files.map((item, index) => {
    const parsed = parseFile(item, index);
    if (paths.has(parsed.relativePath)) throw new RegistryPackageError(`Duplicate package path: ${parsed.relativePath}`);
    paths.add(parsed.relativePath);
    const size = decodeBase64(parsed.contentBase64, parsed.relativePath).byteLength;
    if (size > MAX_FILE_BYTES) throw new RegistryPackageError(`File exceeds size limit: ${parsed.relativePath}`);
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new RegistryPackageError("Package blob exceeds total size limit");
    return Object.freeze(parsed);
  }).sort((left, right) => comparePackagePath(left.relativePath, right.relativePath));
  if (!paths.has("SKILL.md")) throw new RegistryPackageError("Package blob must contain SKILL.md");
  return Object.freeze({ schemaVersion: "skillloom-package-blob-v1", files: Object.freeze(files) });
}

export async function hashPackageBlob(value: PackageBlobV1): Promise<string> {
  const blob = parsePackageBlob(value);
  const root = await mkdtemp(join(tmpdir(), "skillloom-registry-package-"));
  try {
    const files: PackageFile[] = [];
    for (const file of blob.files) {
      const absolutePath = join(root, ...file.relativePath.split("/"));
      const content = decodeBase64(file.contentBase64, file.relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, { flag: "wx" });
      await chmod(absolutePath, file.mode);
      files.push({ relativePath: file.relativePath, absolutePath, size: content.byteLength, mode: file.mode });
    }
    return await hashPackage(files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function parseFile(value: unknown, index: number): PackageBlobFileV1 {
  const record = strictRecord(value, ["relativePath", "mode", "contentBase64"], `files[${index}]`);
  const relativePath = packagePath(record.relativePath);
  const mode = packageMode(record.mode, relativePath);
  if (typeof record.contentBase64 !== "string" || !isCanonicalBase64(record.contentBase64)) {
    throw new RegistryPackageError(`Invalid base64 content for ${relativePath}`);
  }
  decodeBase64(record.contentBase64, relativePath);
  return { relativePath, mode, contentBase64: record.contentBase64 };
}

function packagePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || value.includes("\\")) {
    throw new RegistryPackageError("Package path must be a relative POSIX path without NUL bytes");
  }
  if (posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || posix.normalize(value) !== value) {
    throw new RegistryPackageError(`Unsafe package path: ${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new RegistryPackageError(`Unsafe package path: ${value}`);
  }
  return value;
}

function packageMode(value: unknown, relativePath: string): 420 | 493 {
  if (value !== 0o644 && value !== 0o755) throw new RegistryPackageError(`Invalid normalized mode for ${relativePath}`);
  return value;
}

function isCanonicalBase64(value: string): boolean {
  return value.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    && Buffer.from(value, "base64").toString("base64") === value;
}

function decodeBase64(value: string, relativePath: string): Buffer {
  const content = Buffer.from(value, "base64");
  if (content.includes(0)) throw new RegistryPackageError(`Refusing binary file: ${relativePath}`);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new RegistryPackageError(`File must contain valid UTF-8 text: ${relativePath}`);
  }
  return content;
}

function strictRecord(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RegistryPackageError(`${field} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string")) throw new RegistryPackageError(`${field} contains an unexpected symbol field`);
  for (const key of ownKeys as string[]) {
    if (!expected.has(key)) throw new RegistryPackageError(`${field} contains unexpected field ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new RegistryPackageError(`${field}.${key} must be a plain data field`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) throw new RegistryPackageError(`${field}.${key} is required`);
  }
  return record;
}
