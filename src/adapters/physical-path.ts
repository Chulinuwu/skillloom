import { lstat, realpath, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { PathPolicyError } from "../domain/errors.js";

export async function canonicalizeFuturePath(path: string): Promise<string> {
  let cursor = resolve(path);
  const tail: string[] = [];
  while (true) {
    try {
      await lstat(cursor);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw pathError(path, error);
      }
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new PathPolicyError(`Cannot resolve a physical ancestor for: ${path}`);
      }
      tail.unshift(basename(cursor));
      cursor = parent;
      continue;
    }
    try {
      const physicalAncestor = await realpath(cursor);
      if (!(await stat(physicalAncestor)).isDirectory()) {
        throw new PathPolicyError(`Physical path ancestor is not a directory: ${cursor}`);
      }
      return resolve(physicalAncestor, ...tail);
    } catch (error) {
      if (error instanceof PathPolicyError) {
        throw error;
      }
      throw pathError(path, error);
    }
  }
}

function pathError(path: string, error: unknown): PathPolicyError {
  const message = error instanceof Error ? error.message : String(error);
  return new PathPolicyError(`Cannot resolve physical path '${path}': ${message}`);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}
