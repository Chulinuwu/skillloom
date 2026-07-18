import { rename } from "node:fs/promises";
import { dirname } from "node:path";
import { syncDirectory } from "../files/durability.js";

export async function durableRename(from: string, to: string): Promise<void> {
  await rename(from, to);
  await syncDirectory(dirname(to));
}
