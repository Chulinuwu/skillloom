import type { PromotionCleanup } from "../domain/types.js";
import { discardPromotionPath } from "./files.js";

export async function cleanupRollbackPaths(paths: string[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const path of paths) {
    try {
      await discardPromotionPath(path);
    } catch (error) {
      warnings.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return warnings;
}

export function rollbackCleanupResult(warnings: string[]): PromotionCleanup {
  return warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings };
}
