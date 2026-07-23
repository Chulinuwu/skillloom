import { randomUUID } from "node:crypto";
import { link, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { obsidianBaseDefinitions, renderObsidianBase } from "./obsidian-base-templates.js";

export async function ensureObsidianBases(directory: string): Promise<number> {
  await mkdir(directory, { recursive: true });
  await Promise.all(obsidianBaseDefinitions.map(async (definition) => {
    const target = join(directory, definition.file);
    const temporary = join(directory, `.skillloom-base-${randomUUID()}.tmp`);
    await writeFile(temporary, renderObsidianBase(definition), { mode: 0o644 });
    try {
      await link(temporary, target);
    } catch (error) {
      if (!isAlreadyPresent(error) || !(await stat(target)).isFile()) throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }));
  return obsidianBaseDefinitions.length;
}

function isAlreadyPresent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
