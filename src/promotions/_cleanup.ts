import { discardPromotionPath } from "./files.js";
import type { PromotionCleanup } from "../domain/types.js";
import type { PromotionHooks } from "./types.js";

type CleanupPhase = Parameters<NonNullable<PromotionHooks["beforeCleanup"]>>[0];

export async function cleanupPromotionPaths(
  phase: CleanupPhase,
  paths: string[],
  hooks: PromotionHooks
): Promise<string[]> {
  const results = await Promise.allSettled(paths.map(async (path, index) => {
    await hooks.beforeCleanup?.(phase, path, index);
    await discardPromotionPath(path);
  }));
  return results.flatMap((result, index) => result.status === "rejected"
    ? [`${phase} cleanup failed for ${paths[index]}: ${errorMessage(result.reason)}`]
    : []);
}

export function cleanupResult(warnings: string[]): PromotionCleanup {
  return warnings.length === 0 ? { status: "complete" } : { status: "residue", warnings };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
