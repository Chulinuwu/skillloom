import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePackageRoot(moduleUrl = import.meta.url): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  const candidates = [resolve(moduleDirectory, ".."), resolve(moduleDirectory, "../..")];
  const packageRoot = candidates.find((candidate) => existsSync(resolve(candidate, "package.json")));
  if (!packageRoot) throw new Error("Skillloom package root is missing");
  return packageRoot;
}
