import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePackageRoot } from "../../src/setup/package-root.js";

test("package root is resolved for compiled and bundled runtime layouts", async () => {
  const root = await mkdtemp(join(tmpdir(), "skillloom-package-root-"));
  const modulePaths = [
    join(root, "dist", "setup", "package-root.js"),
    join(root, "plugin-runtime", "skillloom.mjs")
  ];
  try {
    await writeFile(join(root, "package.json"), "{}");
    await Promise.all(modulePaths.map((modulePath) => mkdir(join(modulePath, ".."), { recursive: true })));
    const before = process.cwd();
    for (const modulePath of modulePaths) {
      assert.equal(resolvePackageRoot(pathToFileURL(modulePath).href), root);
      assert.equal(fileURLToPath(pathToFileURL(modulePath)), modulePath);
    }
    assert.equal(process.cwd(), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
