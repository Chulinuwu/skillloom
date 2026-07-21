import { cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { PortableSkillInstallerPort } from "./types.js";

export class PortableSkillInstaller implements PortableSkillInstallerPort {
  async install(packageRoot: string, destinationRoot: string): Promise<"installed" | "unchanged"> {
    const source = join(packageRoot, "skills");
    const destinationRootPath = join(destinationRoot, ".agents", "skills");
    await mkdir(destinationRootPath, { recursive: true });
    let changed = false;
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceSkill = join(source, entry.name);
      const destinationSkill = join(destinationRootPath, entry.name);
      if (await treeHash(sourceSkill) === await optionalTreeHash(destinationSkill)) continue;
      await replaceTree(sourceSkill, destinationSkill);
      changed = true;
    }
    return changed ? "installed" : "unchanged";
  }
}

async function replaceTree(source: string, destination: string): Promise<void> {
    const staging = join(dirname(destination), `.${randomUUID()}.staging`);
    const backup = join(dirname(destination), `.${randomUUID()}.backup`);
    try {
      await cp(source, staging, { recursive: true, force: false });
      const hadDestination = await exists(destination);
      if (hadDestination) await rename(destination, backup);
      try {
        await rename(staging, destination);
      } catch (error) {
        if (hadDestination) await rename(backup, destination);
        throw error;
      }
      await rm(backup, { recursive: true, force: true });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function optionalTreeHash(root: string): Promise<string | null> {
  try {
    return await treeHash(root);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function treeHash(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of await listFiles(root)) {
    hash.update(relativePath);
    hash.update(await readFile(join(root, relativePath)));
  }
  return hash.digest("hex");
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await listFiles(root, relativePath));
    else if (entry.isFile()) paths.push(relativePath);
  }
  return paths.sort();
}
