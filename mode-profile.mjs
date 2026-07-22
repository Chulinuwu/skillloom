const INVOKED_HOSTS = Object.freeze({ claude: "invoked", codex: "invoked", agents: "invoked" });

const MODE_PROFILES = Object.freeze({
  manual: Object.freeze({
    reviewTrigger: "manual",
    brainCapture: "manual",
    retrieval: "explicit",
    promotion: "manual",
    hostLifecycle: INVOKED_HOSTS
  }),
  policy: Object.freeze({
    reviewTrigger: "manual",
    brainCapture: "manual",
    retrieval: "explicit",
    promotion: "policy",
    hostLifecycle: INVOKED_HOSTS
  }),
  hermes: Object.freeze({
    reviewTrigger: "task-end",
    brainCapture: "auto-curated",
    retrieval: "auto-bounded",
    promotion: "policy",
    hostLifecycle: Object.freeze({ claude: "automatic", codex: "invoked", agents: "invoked" })
  })
});

export function modeProfileFor(mode) {
  const profile = MODE_PROFILES[mode];
  if (!profile) {
    throw new TypeError(`Unknown Skillloom mode: ${mode}`);
  }
  return { ...profile, hostLifecycle: { ...profile.hostLifecycle } };
}
