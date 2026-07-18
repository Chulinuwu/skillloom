import { copyFile, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncDirectory } from "../files/durability.js";
import { collectPackageFiles } from "../files/tree.js";
import { hashPackage } from "../skills/hash.js";

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

export async function hashSkillDirectory(path: string): Promise<string> {
  return await hashPackage(await collectPackageFiles(path));
}

export async function stageCanonicalSkill(source: string, stagePath: string): Promise<string> {
  const files = await collectPackageFiles(source);
  await copyPackage(files, stagePath);
  return await hashPackage(await collectPackageFiles(stagePath));
}

export async function backupSkill(destination: string, backupPath: string): Promise<string> {
  const files = await collectPackageFiles(destination);
  await copyPackage(files, backupPath);
  return await hashPackage(await collectPackageFiles(backupPath));
}

export async function discardPromotionPath(path: string): Promise<void> {
  const existed = await pathExists(path);
  await rm(path, { recursive: true, force: true });
  if (existed) {
    await syncDirectory(dirname(path));
  }
}

async function copyPackage(files: Awaited<ReturnType<typeof collectPackageFiles>>, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination);
  try {
    for (const file of files) {
      const target = join(destination, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file.absolutePath, target);
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
