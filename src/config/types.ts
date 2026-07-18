import type { Scope, ScopedTargetName, SkillloomMode } from "../domain/types.js";

export type AutoPromotionPolicy = {
  targets: ScopedTargetName[];
  scope: Scope;
  maxFiles: number;
  maxTotalBytes: number;
  allowWarnings: boolean;
  allowExecutables: boolean;
};

export type HermesSettings = {
  minToolCalls: number;
};

export type SkillloomConfig = {
  version: number;
  createdAt: string;
  mode: SkillloomMode;
  policy: AutoPromotionPolicy;
  hermes: HermesSettings;
};
