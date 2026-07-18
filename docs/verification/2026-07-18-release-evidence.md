# Release evidence

Observed on 2026-07-18. This document records gate results observed from the local source checkout. It does not mark G007 complete.

## Source and package gates

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run validate:plugin` passed. The Node test suite reported 97 passing tests.
- The repository validator passed: `Skillloom plugin validation passed.` Its manifest checks confirm that Claude uses conventional root discovery, Codex declares `skills: "./skills/"`, and the Codex manifest omits unsupported `hooks`.
- `claude plugin validate .` passed for `.claude-plugin/marketplace.json`.
- The official Codex plugin validator passed in an isolated temporary Python virtual environment with PyYAML: `validate_plugin.py .`.
- Both Skill Creator validators passed in that same isolated PyYAML environment: `quick_validate.py skills/capture-learning` and `quick_validate.py skills/curate-skills`.
- `npm pack --dry-run --json` reported `skillloom@0.1.0`, 77 entries, `skillloom-0.1.0.tgz`, and no bundled dependencies. Its contents are the package metadata, `LICENSE`, `README.md`, compiled `dist/**`, and the two portable skill directories with their `SKILL.md` and `agents/openai.yaml` files.
- A standalone packed-tarball smoke test resolved and started the `skillloom` bin through an npm-style symlink.

## Isolated install smoke tests

- A Claude Code local-marketplace install completed for `skillloom@skillloom-dev` at manifest version `0.1.0`; it exposed the two bundled skills and the Claude `SessionStart` registration.
- A Codex local-marketplace/plugin install completed and `codex plugin list --json` reported the plugin installed and enabled. For a local URL source, Codex reports the version as `local`; this is CLI source behavior, not a replacement for the `0.1.0` version declared in package and plugin manifests.
- The direct Claude bootstrap invocation emitted only `hookSpecificOutput`, named `SessionStart`, wrote no stderr output, and supplied a short context that mentions `$capture-learning` but not `$curate-skills`.
- These checks used isolated temporary install/config locations. No real user configuration was mutated.

## Decision record

The Codex manifest intentionally omits `hooks` because the current official schema rejects that field. Claude hook registration remains conventional at `hooks/hooks.json`, which keeps the Claude hook from auto-loading under Codex. Re-evaluate this compatibility decision if the official Codex schema changes.

G007 remains open pending its own checkpoint decision.
