import { open } from "node:fs/promises";

export async function syncDirectory(path: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF" && code !== "EISDIR" && code !== "EPERM") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}
