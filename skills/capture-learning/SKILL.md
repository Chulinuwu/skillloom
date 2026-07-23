---
name: capture-learning
description: Capture a reusable workflow as a Skillloom-managed Agent Skill candidate with provenance, validation, trust scanning, approval, promotion, and rollback evidence. Use after a complex task reveals repeatable steps, when the user asks to learn or save a workflow as a skill, or when verified task evidence should become a portable skill. Do not use for one-off notes or autonomous promotion.
---

# Capture Learning

Turn verified task evidence into one focused, harness-neutral Agent Skill candidate. Treat drafting and promotion as separate decisions.
Respond in the language of the user's latest message. Keep exact identifiers, hashes, paths, and source titles unchanged.

## Workflow

1. Confirm that the workflow is reusable and identify the narrow behavior the skill should preserve.
2. Create a temporary skill directory containing `SKILL.md` and only the resources required by that workflow. Exclude credentials, full transcripts, unrelated artifacts, symlinks, binaries, and machine-specific instructions.
3. Record concise provenance such as a task or issue identifier. Do not store conversation bodies as evidence.
4. Run `skillloom capture <skill-directory> --created-by agent --evidence <reference>` and retain the candidate and operation identifiers.
5. Run `skillloom validate <candidate-id>`. Review structural validation and every trust finding. Treat the scan as preflight evidence, not proof that content is safe.
6. Present the candidate summary, provenance, content hash, findings, intended targets, and reload impact. Stop when a danger finding exists. Ask before accepting warnings or promoting.
7. Only after explicit approval, run `skillloom promote <candidate-id> --target <targets> --scope <scope> --yes`. Add `--accept-warnings` only when the user explicitly accepts the reported warnings.
8. Verify the promotion record, destination hashes, and target results. Report the promotion identifier and whether a reload or new session is required.
9. If verification fails, inspect `skillloom status` and use `skillloom resume <operation-id> --yes` only when its staged evidence still agrees. Otherwise run `skillloom rollback <promotion-id> --yes` and report the restored hashes.

Never promote autonomously. A request to capture or validate is not approval to publish.
