import { open, rename, rm, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { syncDirectory } from "./durability.js";

export type AtomicWriteOptions = {
  mode?: number;
};
export async function atomicWriteFile(path: string, data: string | Buffer, options: AtomicWriteOptions = {}): Promise<void> {
  const tmp = join(dirname(path), `.tmp-${process.pid}-${randomUUID()}`);
  let handle: FileHandle | undefined;
  let renamed = false;
  try {
    handle = await open(tmp, "wx+", options.mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tmp, path);
    renamed = true;
    await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (!renamed) await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown, options: AtomicWriteOptions = {}): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}
