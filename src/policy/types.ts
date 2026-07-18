import type { TargetName, TargetScope } from "../domain/types.js";

export type AutoPromotionRequest = {
  candidateId: string;
  packageHash: string;
  targets: TargetName[];
  scopes: TargetScope[];
  files: Array<{ relativePath: string; size: number; mode: number }>;
  warnings: number;
  dangers: number;
};

export type PolicyDecision = {
  approved: boolean;
  mode: "manual" | "policy" | "hermes";
  candidateId: string;
  packageHash: string;
  reasons: string[];
  evaluatedAt: string;
};
