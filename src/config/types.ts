import type { Scope, ScopedTargetName, SkillCapability, SkillloomMode } from "../domain/types.js";

export type AutoPromotionPolicy = {
  targets: ScopedTargetName[];
  scope: Scope;
  maxFiles: number;
  maxTotalBytes: number;
  allowWarnings: boolean;
  allowExecutables: boolean;
  allowedCapabilities?: SkillCapability[];
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
