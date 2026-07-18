import { mkdir, readFile } from "node:fs/promises";
import type { SkillloomConfig } from "./types.js";
import type { SkillloomMode } from "../domain/types.js";
import { createDefaultConfig, parseConfig } from "./schema.js";
import { storeLayout } from "../store/layout.js";
import { atomicWriteJson } from "../files/atomic-write.js";

export async function ensureConfig(root: string): Promise<SkillloomConfig> {
  const layout = storeLayout(root);
  await mkdir(layout.root, { recursive: true });
  const existing = await readConfig(root);
  if (existing) {
    return existing;
  }
  const config = createDefaultConfig(new Date().toISOString());
  await atomicWriteJson(layout.config, config);
  return config;
}

export async function readConfig(root: string): Promise<SkillloomConfig | null> {
  try {
    return parseConfig(JSON.parse(await readFile(storeLayout(root).config, "utf8")));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function setMode(root: string, mode: SkillloomMode): Promise<SkillloomConfig> {
  const config = { ...await ensureConfig(root), mode };
  await atomicWriteJson(storeLayout(root).config, config);
  return config;
}
