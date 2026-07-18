import { lstat, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "../files/durability.js";
import { copyPackageFiles } from "../files/package-copy.js";
import { collectPackageFiles } from "../files/tree.js";
import { hashPackage, hashPackageForExpected } from "../skills/hash.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function hashSkillDirectory(path: string, expectedHash?: string): Promise<string> {
  const files = await collectPackageFiles(path);
  return expectedHash ? await hashPackageForExpected(files, expectedHash) : await hashPackage(files);
}

export async function stageCanonicalSkill(source: string, stagePath: string, expectedHash?: string): Promise<string> {
  const files = await collectPackageFiles(source);
  await copyPackageFiles(files, stagePath);
  return await hashSkillDirectory(stagePath, expectedHash);
}

export async function backupSkill(destination: string, backupPath: string, expectedHash?: string): Promise<string> {
  const files = await collectPackageFiles(destination);
  await copyPackageFiles(files, backupPath);
  return await hashSkillDirectory(backupPath, expectedHash);
}

export async function discardPromotionPath(path: string): Promise<void> {
  const existed = await pathExists(path);
  await rm(path, { recursive: true, force: true });
  if (existed) {
    await syncDirectory(dirname(path));
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
