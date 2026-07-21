import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePackageRoot(moduleUrl = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../..");
}
