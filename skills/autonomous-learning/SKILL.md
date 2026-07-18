---
name: autonomous-learning
description: Review a completed Claude Code or Codex task for reusable procedural knowledge, record a bounded learning decision, and create or patch a Skillloom candidate when evidence supports it. Use when the Skillloom Hermes Stop hook requests a review, when the user invokes learn or journey behavior, or after repeated corrections reveal a stable workflow. Automatic promotion remains constrained by deterministic project policy, validation, trust scanning, quarantine, and rollback evidence.
---

Review the completed task without storing its transcript. Produce exactly one decision: `no-op`, `memory`, `skill-create`, or `skill-patch`.

1. Run `skillloom mode --json`. If the mode is `manual`, do not promote without explicit `--yes` approval. If it is `policy` or `hermes`, only `--policy` may authorize autonomous promotion.
2. Identify a narrow behavior that is both reusable and supported by verified task evidence. A one-off fact, project status, or speculative preference is not a skill.
3. If nothing reusable exists, run `skillloom observe --source <claude|codex|agents> --outcome no-op --summary <bounded-summary>` and finish. The summary must not contain credentials, transcript bodies, or private user content.
4. Use `memory` only for a concise declarative decision that should appear in the Skillloom journey. This release records the classification and summary but does not inject it as harness memory.
5. For `skill-create`, draft one canonical Agent Skill package in a temporary directory. For `skill-patch`, start from the installed skill and capture with `--base <installed-skill-directory>` so concurrent edits are protected.
6. Keep the skill harness-neutral unless the learned procedure inherently targets a harness. Include only required `SKILL.md`, references, scripts, or assets. Exclude symlinks, binaries, credentials, full transcripts, and unrelated artifacts.
7. Run `skillloom capture <skill-directory> --created-by agent --evidence <concise-reference>`, then `skillloom validate <candidate-id>`. Review every finding and retain the candidate hash.
8. Record the decision with `skillloom observe --source <claude|codex|agents> --outcome <skill-create|skill-patch> --summary <bounded-summary> --candidate <candidate-id>`.
9. In `policy` or `hermes` mode, run `skillloom promote <candidate-id> --target claude,codex --scope project --policy`. Never combine `--policy` with `--yes` or `--accept-warnings`.
10. Treat a rejected policy decision as quarantine, not failure to be bypassed. Leave the validated candidate intact and report the reasons. Do not weaken configuration or retry another target to evade policy.
11. Verify the promotion record and destination hashes. If a transaction is interrupted, inspect `skillloom status` before using `resume`. If installed behavior regresses, use the recorded promotion ID for rollback.

Do not create a skill merely to satisfy the hook. A correct `no-op` decision is expected when the evidence is not reusable.
