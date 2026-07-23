---
name: curate-skills
description: Inspect and improve Skillloom-managed Agent Skills with base-hash protection, validation, trust scanning, explicit approval, promotion, and rollback evidence. Use when a managed skill is stale, duplicated, unclear, failing in real use, or needs a reviewed update. Do not use to silently rewrite installed skills or promote changes autonomously.
---

# Curate Skills

Improve a managed skill from observed evidence while preserving its provenance and the user's ability to reject or reverse the change.
Respond in the language of the user's latest message. Keep exact identifiers, hashes, paths, and source titles unchanged.

## Workflow

1. Identify the installed skill, its active path, the behavior that failed or drifted, and the evidence supporting a change.
2. Inspect the full package and its promotion history. Separate confirmed defects from stylistic preferences.
3. Copy the skill to a temporary directory and make the smallest coherent revision. Keep `SKILL.md` harness-neutral, remove stale resources, and do not add credentials, transcript bodies, symlinks, binaries, or machine-specific tool instructions.
4. Run `skillloom capture <revised-skill-directory> --created-by agent --base <installed-skill-path> --evidence <reference>`. The recorded base hash protects concurrent human edits.
5. Run `skillloom validate <candidate-id>`. Compare the candidate with the installed base and review every trust finding. The scan is preflight evidence, not a malware-proof sandbox.
6. Present the behavioral change, diff summary, provenance, base and candidate hashes, findings, intended targets, and reload impact. Stop on danger findings and ask before accepting warnings or promoting.
7. Only after explicit approval, run `skillloom promote <candidate-id> --target <targets> --scope <scope> --yes`. Add `--accept-warnings` only for warnings the user explicitly accepts.
8. Verify destination hashes and the promotion record. If the base changed after capture, do not force an overwrite; recapture from the new base.
9. If verification fails, inspect `skillloom status`. Resume only when staged evidence still agrees. Otherwise run `skillloom rollback <promotion-id> --yes` and report the rollback record and restored hashes.

Never edit an active destination directly and never promote autonomously.
