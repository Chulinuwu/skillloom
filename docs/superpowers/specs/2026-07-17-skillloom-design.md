# Skillloom Design

## Status

Approved for autonomous implementation by the repository owner on 2026-07-17. The owner explicitly deferred review until the implementation is complete.

## Problem

Agent Skills are portable at the `SKILL.md` layer, but learning and maintenance are not portable. Each harness has different discovery paths, plugin manifests, hooks, trust prompts, and installation behavior. A generated Markdown file is not enough: a learned skill can contain executable instructions and scripts, so creation must include provenance, validation, security scanning, atomic promotion, and rollback.

Skillloom provides that missing lifecycle without becoming another agent runtime.

## Goals

- Let an agent turn reusable task evidence into an Agent Skills-compatible candidate.
- Keep one canonical skill package and publish it through harness adapters.
- Support Claude Code and Codex as first-class targets.
- Support other agents through the standard `.agents/skills` target and a generic directory adapter.
- Make every mutation inspectable, resumable, atomic, and reversible.
- Keep the runtime local-first and provider-independent.
- Ship as an installable Claude Code and Codex plugin plus a standalone CLI.

## Non-goals

- Running an LLM, choosing a model, or owning agent conversations.
- Background daemons, cloud registries, telemetry, or scheduled curation.
- Automatically trusting third-party skills.
- Replacing each harness's plugin, hook, or permission model.
- Copying Hermes Agent's application topology.

## Architecture Decision

Use a TypeScript CLI kernel with a small domain library and per-harness filesystem adapters.

The alternatives were a git/PR-only evolution workflow and an MCP service. Git-only makes local learning too heavy. MCP adds a daemon and a larger trust surface before the filesystem lifecycle is proven. The CLI kernel works in any harness that can run commands, and its artifacts remain usable without the original agent.

## Package Boundaries

### CLI

`src/cli/` parses commands, formats output, and maps exit codes. It does not own domain rules.

Commands:

- `init`: create `.skillloom/config.json`, stores, and the event journal.
- `capture`: create an immutable candidate from a supplied skill directory.
- `validate`: validate Agent Skills structure, metadata, references, and policy.
- `promote`: publish a validated candidate to one or more harness targets.
- `rollback`: restore all targets changed by a promotion.
- `status`: show candidates, promotions, and interrupted operations.
- `doctor`: verify runtime, config, and harness discovery paths.

### Domain

`src/domain/` defines candidates, operations, events, promotion records, trust findings, adapters, and configuration. Variants use discriminated unions rather than optional-field bags.

### Skill package validation

`src/skills/` parses `SKILL.md`, validates Agent Skills metadata, verifies referenced local files, rejects binary and symlink surprises, and computes a content hash over a stable file ordering.

### Trust scanner

`src/security/` applies deterministic rules to instructions and scripts. Findings are `info`, `warning`, or `danger`. Danger blocks promotion. Warning requires explicit override. The scanner detects path escape attempts, secret-like material, prompt override phrases, destructive shell patterns, persistence commands, encoded payload execution, and undeclared executable files.

This is a preflight guard, not a malware-proof sandbox. The CLI states that boundary in every report.

### Store and journal

`src/store/` owns `.skillloom/` layout, atomic writes, locks, candidates, backups, and append-only JSONL events.

Every operation receives an `operationId`. Phase transitions are appended to `events.jsonl`. Temporary files are created beside the destination and renamed atomically. An operation can resume from its last completed phase. A lock directory prevents concurrent writers. Stale locks are never silently removed.

### Promotion service

`src/promotions/` stages all target copies first, snapshots existing targets, commits each target, and compensates already committed targets if a later target fails. A successful promotion records exact destination paths, before and after hashes, and backup references.

### Harness adapters

`src/adapters/` converts a logical scope into a discovery path and exposes doctor checks.

- Claude Code project: `<repo>/.claude/skills/<name>`
- Claude Code user: `~/.claude/skills/<name>`
- Codex project: `<repo>/.agents/skills/<name>`
- Codex user: `~/.agents/skills/<name>`
- Generic: an explicit destination directory

Adapters copy canonical skill content. They never rewrite `SKILL.md` for a harness. Harness-specific bootstrap and tool mapping belong to plugin files, not generated skill bodies.

## Canonical Data Model

### Candidate

- stable `candidateId`
- skill `name`, `description`, and content hash
- immutable snapshot under `.skillloom/candidates/<candidateId>/skill/`
- `createdAt`, `createdBy`, source evidence, and base skill hash when improving an existing skill
- lifecycle state: `captured`, `validated`, `blocked`, `promoted`, or `superseded`

### Operation event

- stable `operationId`
- event sequence number and UTC timestamp
- operation kind and phase
- structured evidence or error
- no credentials or transcript bodies

### Promotion

- stable `promotionId`
- candidate and operation IDs
- target adapter, scope, destination, hashes, and backup path
- result: `applied`, `compensated`, or `rolled-back`

## Learning Flow

1. The agent recognizes a reusable workflow or receives an explicit request to learn.
2. The bundled `capture-learning` skill tells the agent to create a focused Agent Skill package in a temporary directory.
3. `skillloom capture` snapshots that package and records concise source evidence.
4. `skillloom validate` parses metadata, resolves files, hashes content, and runs trust rules.
5. The agent shows the candidate summary and findings.
6. `skillloom promote` requires `--yes`. Warning findings additionally require `--accept-warnings`.
7. The promotion transaction publishes identical canonical content to selected harness targets.
8. The agent reports whether a harness reload or new session is required.

Automatic drafting is allowed. Automatic promotion is not part of the initial release.

## Improvement Flow

An improvement is captured with `--base <installed-skill-path>`. The candidate stores the base hash. Promotion fails if the installed base hash changed after capture. This prevents an agent from overwriting concurrent human edits. The user can capture a new candidate against the new base.

## Failure and Recovery

- Invalid input produces a structured error and no active mutation.
- Interrupted capture leaves only a temporary directory that `status` reports.
- Interrupted promotion resumes only when journal and staged hashes agree.
- Multi-target failure compensates earlier targets before returning failure.
- Rollback verifies the current installed hash before restoring a backup. A mismatch requires explicit `--force` to avoid deleting newer work.
- Events are append-only; corrections create new events.

## Plugin Delivery

The repository is one multi-harness source tree:

- `.claude-plugin/plugin.json` and `hooks/hooks.json` for Claude Code.
- `.codex-plugin/plugin.json` intentionally omits `hooks`: the current official Codex schema rejects that field, which also prevents Claude hooks from auto-loading. Keep Claude hook registration conventional at `hooks/hooks.json`, and re-evaluate the Codex manifest if the official schema changes.
- `.agents/plugins/marketplace.json` for Codex development installation.
- `.claude-plugin/marketplace.json` for Claude Code development installation.
- `skills/` contains harness-neutral Skillloom workflow skills.

Claude Code receives a small SessionStart bootstrap that names Skillloom's workflow and points to native skills. Codex relies on native skill discovery. Neither bootstrap changes user-owned global instructions.

## Testing Strategy

- Unit tests for metadata, naming, hashing, scanner rules, path policy, adapters, and state transitions.
- Filesystem integration tests with isolated temporary homes and repositories.
- Crash and compensation tests around multi-target promotion.
- Manifest validation with `claude plugin validate` and the Codex plugin validator.
- CLI smoke tests for init, capture, validate, promote, status, doctor, and rollback.
- Local marketplace installation smoke tests for both Claude Code and Codex when the installed CLIs support non-interactive local sources.

## Architecture Invariants

1. Canonical skill content is harness-neutral.
2. Active skill destinations are never written before validation and scanning pass.
3. Every active mutation has provenance, a journal trail, and rollback evidence.
4. Promotion never follows symlinks or accepts path traversal.
5. Partial multi-target failure restores already changed targets.
6. User credentials and full conversation transcripts never enter the journal.
7. The initial release requires explicit promotion approval.
8. Claude Code and Codex integration use their native install and discovery mechanisms.

## Deferred Work

- LLM-driven candidate generation inside the CLI.
- Hosted registry and signed bundles.
- Automatic behavior eval generation.
- MCP server and long-running curator.
- Additional first-class harness adapters beyond Claude Code and Codex.
