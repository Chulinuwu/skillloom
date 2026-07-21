import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePackageRoot } from "../../src/setup/package-root.js";

test("package root is resolved from the module URL instead of cwd", () => {
  const modulePath = join("/opt", "skillloom", "dist", "setup", "package-root.js");
  const before = process.cwd();
  assert.equal(resolvePackageRoot(pathToFileURL(modulePath).href), dirname(dirname(dirname(modulePath))));
  assert.equal(process.cwd(), before);
  assert.equal(fileURLToPath(pathToFileURL(modulePath)), modulePath);
});
