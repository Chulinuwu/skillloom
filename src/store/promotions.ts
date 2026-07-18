import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PromotionRecord } from "../domain/types.js";
import { atomicWriteJson } from "../files/atomic-write.js";
import { storeLayout } from "./layout.js";

export async function writePromotionRecord(root: string, record: PromotionRecord): Promise<void> {
  assertPromotionId(record.promotionId);
  const directory = join(storeLayout(root).promotions, record.promotionId);
  await mkdir(directory, { recursive: true });
  await atomicWriteJson(join(directory, "promotion.json"), record);
}

export async function readPromotion(root: string, promotionId: string): Promise<PromotionRecord> {
  assertPromotionId(promotionId);
  const path = join(storeLayout(root).promotions, promotionId, "promotion.json");
  return JSON.parse(await readFile(path, "utf8")) as PromotionRecord;
}

function assertPromotionId(promotionId: string): void {
  if (!/^promo-[a-zA-Z0-9-]+$/.test(promotionId)) {
    throw new Error(`Invalid promotion ID: ${promotionId}`);
  }
}

export async function listPromotions(root: string): Promise<PromotionRecord[]> {
  try {
    const ids = await readdir(storeLayout(root).promotions);
    const records = await Promise.all(ids.sort().map((id) => readPromotion(root, id)));
    return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
