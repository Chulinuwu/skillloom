import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ensureConfig } from "../src/config/service.js";
import { ValidationError } from "../src/domain/errors.js";
import { activeHashAt } from "../src/promotions/_rollback-validation.js";
import { listCandidates } from "../src/store/candidates.js";
import { tempDir } from "./helpers/fixtures.js";

test("config creation does not mask malformed existing state", async () => {
  const root = await tempDir("skillloom-config-");
  const configPath = join(root, ".skillloom", "config.json");
  await ensureConfig(root);
  await writeFile(configPath, "{malformed\n");

  await assert.rejects(() => ensureConfig(root), SyntaxError);
  assert.equal(await readFile(configPath, "utf8"), "{malformed\n");

  await writeFile(configPath, JSON.stringify({ version: 1 }));
  await assert.rejects(() => ensureConfig(root), /invalid Skillloom config/i);
});

test("candidate listing defaults only when the store directory is absent", async () => {
  const root = await tempDir("skillloom-candidates-");
  assert.deepEqual(await listCandidates(root), []);

  const candidateRoot = join(root, ".skillloom", "candidates", "cand-broken");
  await mkdir(candidateRoot, { recursive: true });
  await writeFile(join(candidateRoot, "candidate.json"), "{malformed\n");

  await assert.rejects(() => listCandidates(root), SyntaxError);
});

test("active hash treats only a missing destination as absent", async () => {
  const root = await tempDir("skillloom-active-hash-");
  const destination = join(root, "safe-skill");
  assert.equal(await activeHashAt(destination), null);

  await mkdir(destination);
  await writeFile(join(destination, "binary"), Buffer.from([0]));

  await assert.rejects(() => activeHashAt(destination), ValidationError);
});
