import { open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { syncDirectory } from "./durability.js";

export async function atomicWriteFile(path: string, data: string | Buffer): Promise<void> {
  const tmp = join(dirname(path), `.tmp-${process.pid}-${randomUUID()}`);
  await writeFile(tmp, data);
  const handle = await open(tmp, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
