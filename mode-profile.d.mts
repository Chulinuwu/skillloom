export type ReviewTrigger = "manual" | "meaningful-delta";
export type BrainCaptureMode = "manual" | "auto-curated";
export type RetrievalMode = "explicit" | "auto-bounded";
export type ContextRefreshMode = "automatic";
export type PromotionMode = "manual" | "policy";
export type HostLifecycleMode = "automatic" | "invoked";
export type SkillloomMode = "manual" | "policy" | "hermes";
export type ModeProfile = {
  reviewTrigger: ReviewTrigger;
  brainCapture: BrainCaptureMode;
  retrieval: RetrievalMode;
  contextRefresh: ContextRefreshMode;
  promotion: PromotionMode;
  hostLifecycle: {
    claude: HostLifecycleMode;
    codex: HostLifecycleMode;
    agents: HostLifecycleMode;
  };
};
export function modeProfileFor(mode: SkillloomMode): ModeProfile;
