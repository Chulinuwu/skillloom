# Skillloom

Skillloom adds policy-gated skill learning to Claude Code, Codex, and portable Agent Skills consumers. It adapts the useful self-improvement loop from Hermes Agent to plugin lifecycle hooks while leaving conversations, tools, model routing, and execution inside the host agent.

The host agent reviews completed work, drafts a focused Agent Skill candidate, and asks Skillloom to validate and promote it. Skillloom owns the safety boundary: immutable snapshots, deterministic trust findings, policy decisions, transactional installation, crash recovery, quarantine evidence, and rollback.

## Modes

| Mode | Post-task review | Promotion approval |
| --- | --- | --- |
| `manual` | Only when invoked | Explicit `--yes` from the user |
| `policy` | Only when invoked | `--policy` after deterministic policy passes |
| `hermes` | Stop hook requests `$autonomous-learning` after a non-trivial turn | Same deterministic policy as `policy` |

New stores default to `manual`. Existing v0.1 stores also load as `manual` without a destructive migration.

```bash
skillloom init
skillloom mode hermes
skillloom mode --json
```

The default automatic policy permits only project-scoped Claude Code and Codex destinations, at most 20 files and 256 KiB, with no warnings, danger findings, or executable files. Generic directories and user scope require manual approval. Edit `.skillloom/config.json` only when deliberately changing that trust boundary.

## Hermes-style learning loop

In `hermes` mode, the plugin Stop hook checks the completed turn cadence. When review is due, it asks the host agent to use `$autonomous-learning` once. The hook honors `stop_hook_active`, so the review cannot create an infinite stop loop.

The agent produces one bounded decision:

- `no-op`: nothing reusable was learned
- `memory`: a declarative journey entry, not injected harness memory
- `skill-create`: a new procedural skill candidate
- `skill-patch`: an update based on an installed skill hash

Learning records contain a short summary and identifiers. Skillloom does not persist full transcripts, credentials, or model context.

```bash
skillloom observe \
  --source codex \
  --outcome no-op \
  --summary "The completed task did not reveal a reusable procedure"

skillloom journey --json
```

For reusable work, the host agent follows the same candidate lifecycle in every mode:

```bash
skillloom capture ./draft-skill \
  --created-by agent \
  --evidence task:123 \
  --json

skillloom validate cand-20260718120000-example --json
```

Manual promotion:

```bash
skillloom promote cand-20260718120000-example \
  --target claude,codex \
  --scope project \
  --yes
```

Policy-gated promotion:

```bash
skillloom promote cand-20260718120000-example \
  --target claude,codex \
  --scope project \
  --policy
```

Do not combine `--policy` with `--yes`. Warning acceptance is manual only. A failed automatic decision is recorded and the candidate remains available for review instead of being deleted or installed.

## Recovery and rollback

Promotion uses staging, durable checkpoints, backups, destination hash verification, and compensation across multiple targets. A long-running operation can be inspected and resumed after interruption.

```bash
skillloom status --json
skillloom resume op-example --yes
skillloom rollback promo-example --yes
skillloom recover-lock journal --yes
```

`resume` verifies recorded staged hashes before continuing. `rollback` protects newer installed content unless `--force` is explicitly supplied after reviewing the conflict.

## Plugin installation

Clone the repository and build the CLI first:

```bash
npm ci
npm run build
npm link
```

`npm link` exposes the local `skillloom` binary used by the bundled skills. When a published v0.2 package is available, `npm install --global skillloom@0.2` is the equivalent CLI installation.

Install for Claude Code from the repository root:

```bash
claude plugin marketplace add .
claude plugin install skillloom@skillloom-dev --scope local
claude plugin details skillloom@skillloom-dev
```

Install for Codex from the repository root:

```bash
codex plugin marketplace add .
codex plugin add skillloom@skillloom-dev
codex plugin list
```

Both harnesses discover the same root `skills/` tree and `hooks/hooks.json`. Lifecycle hooks run only after the harness trusts the plugin. Start a new session or task after installation, update, or mode changes that affect startup context.

The canonical adapters install skills to:

| Target | Project destination | User destination |
| --- | --- | --- |
| Claude Code | `<project>/.claude/skills/<skill-name>` | `~/.claude/skills/<skill-name>` |
| Codex | `<project>/.agents/skills/<skill-name>` | `~/.agents/skills/<skill-name>` |
| Agents | `<project>/.agents/skills/<skill-name>` | `~/.agents/skills/<skill-name>` |
| Generic | `<destination>/<skill-name>` | `<destination>/<skill-name>` |

## Security boundary

Skillloom does not embed an LLM, replace the host agent runtime, operate a daemon, or claim that deterministic scanning proves behavioral quality. The host agent still decides what procedure to draft. Automatic approval only proves that the immutable candidate satisfies the configured structural and trust policy.

Danger findings always block promotion. Manual warning overrides require both `--accept-warnings` and `--yes`. Executable resources are denied by the default automatic policy even when the package declares them.

Runtime state lives under `.skillloom/`: configuration, immutable candidates, learning events, the append-only journal, promotions, operations, backups, staging data, and locks.

## Development

Requirements are Node.js 20 or newer and npm. Claude Code and Codex CLIs are only required for their official plugin validators.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:plugin
npm pack
```

Validate the plugin skills directly when changing their instructions:

```bash
python3 /path/to/skill-creator/scripts/quick_validate.py skills/autonomous-learning
python3 /path/to/skill-creator/scripts/quick_validate.py skills/capture-learning
python3 /path/to/skill-creator/scripts/quick_validate.py skills/curate-skills
```
