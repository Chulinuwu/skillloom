import { mkdir, readFile } from "node:fs/promises";
import { STORE_VERSION } from "./defaults.js";
import { storeLayout } from "../store/layout.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { ValidationError } from "../domain/errors.js";

export async function ensureConfig(root: string): Promise<{ version: number; createdAt: string }> {
  const layout = storeLayout(root);
  await mkdir(layout.root, { recursive: true });
  let source: string;
  try {
    source = await readFile(layout.config, "utf8");
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
    const config = { version: STORE_VERSION, createdAt: new Date().toISOString() };
    await atomicWriteJson(layout.config, config);
    return config;
  }
  const config: unknown = JSON.parse(source);
  if (typeof config !== "object" || config === null
    || !("version" in config) || typeof config.version !== "number" || config.version !== STORE_VERSION
    || !("createdAt" in config) || typeof config.createdAt !== "string" || Number.isNaN(Date.parse(config.createdAt))) {
    throw new ValidationError("Invalid Skillloom config");
  }
  return { version: config.version, createdAt: config.createdAt };
}
