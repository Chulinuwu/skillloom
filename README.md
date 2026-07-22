# Skillloom

![Skillloom weaving portable Agent Skills through validation and rollback](assets/skillloom-hero.webp)

Local-first package manager and lifecycle control plane for versioned, auditable, and reversible Agent Skills across Claude Code and Codex.

[![npm version](https://img.shields.io/npm/v/%40chulinxz%2Fskillloom.svg)](https://www.npmjs.com/package/@chulinxz/skillloom)
[![CI](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Skillloom capture, validate, and promote demo](assets/demo.webp)

Skillloom adapts the useful self-improvement loop from Hermes Agent to plugin lifecycle hooks while leaving conversations, tools, model routing, and execution inside the host agent.

The host agent reviews completed work, drafts a focused Agent Skill candidate, and asks Skillloom to validate and promote it. Skillloom owns the safety boundary: immutable snapshots, deterministic trust findings, policy decisions, transactional installation, crash recovery, quarantine evidence, and rollback.

## Why Skillloom?

Copying a skill directory installs whatever is there at that moment. It does not preserve what the agent proposed, why it was accepted, what was scanned, which targets changed, or how to safely undo a partial install.

| Plain folder copy | Skillloom |
| --- | --- |
| Mutable source copied directly | Immutable candidate snapshot |
| Review depends on the current agent turn | Deterministic structure and trust scan |
| One destination at a time | Transactional Claude Code and Codex promotion |
| No durable history | Append-only journal and promotion records |
| Manual cleanup after a bad update | Hash-protected rollback and crash recovery |

Local-first means the policy, candidates, audit trail, backups, and locks live under the local `.skillloom/` store. Skillloom has no hosted control plane, account, telemetry service, or daemon. The host agent may still use a cloud model.

## Optional Private Hub

Optional private Hub sync can be added through Tailscale without changing the local-first boundary. The Hub service ID is `svc:skillloom`, but clients discover and use the MagicDNS URL `https://skillloom.<MagicDNSSuffix>`, never `https://svc:skillloom`.

The plugin's `$setup-skillloom` workflow is the primary installer. To host the stack, export a reusable tagged `TS_AUTHKEY` locally, never into chat, and let the workflow run `skillloom host install`. It creates private state under `~/.skillloom/host`, starts Docker, and prints the generated tailnet policy path. An admin still owns the explicit policy and Service approval decisions. Do not enable Funnel.

Each client configures trust interactively:

```bash
skillloom setup --target auto --hub auto --scope user
```

Use `--yes` only for explicit noninteractive acceptance. `skillloom sync` imports available Hub records as a dry run, and `skillloom sync --apply` applies them transactionally.

The same Skillloom plugin and bundled MCP bridge work across Claude Code, Codex, and many machines without a separate global CLI install. Each device keeps its own local `.skillloom` root, so offline and local-only workflows continue, and the Hub is not a shared mutable vault mount.

The hosted stack includes a hardened Obsidian Web UI at `https://skillloom-obsidian.<MagicDNSSuffix>` on HTTPS port `443`; its internal container port is `3000`. The Skillloom vault is mounted read-only. Agents and users write through authenticated MCP or HTTP calls so revisions and audit records remain valid. Direct Obsidian, network-share, and filesystem-sync writes remain unsupported until the external-revision adapter exists.

## Install

After installing the plugin, invoke `$setup-skillloom`. The bundled runner does not require a globally installed `skillloom` binary. A client can also be connected explicitly with a pasted credential-free Hub link:

```bash
skillloom setup --target auto --hub auto --hub-url https://skillloom.<MagicDNSSuffix> --scope user
```

Host lifecycle commands are idempotent:

```bash
skillloom host install
skillloom host status
```

```bash
npm install --global @chulinxz/skillloom@0.2
skillloom init
```

Capture, validate, and promote one candidate:

```bash
skillloom capture ./draft-skill --created-by agent
skillloom validate <candidate-id>
skillloom promote <candidate-id> --target claude,codex --scope project --yes
```

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

The default automatic policy permits only project-scoped Claude Code and Codex destinations, at most 20 files and 256 KiB, with no warnings, danger findings, executable files, or declared host capabilities. Generic directories and user scope require manual approval. Edit `.skillloom/config.json` only when deliberately changing that trust boundary.

Skills may declare an advisory capability manifest using the supported inline frontmatter form:

```yaml
---
name: repository-audit
description: Audit a local repository and report findings.
capabilities: [filesystem-read, shell]
---
```

Supported capabilities are `filesystem-read`, `filesystem-write`, `network`, `shell`, and `secrets`. Automatic promotion rejects declarations outside `policy.allowedCapabilities`; the default allowlist is empty. Declarations make review and policy intent explicit, but cannot prove that prose will not request an undeclared capability.

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

Install the published CLI:

```bash
npm install --global @chulinxz/skillloom@0.2
```

For local development, clone the repository, run `npm ci && npm run build`, then use `npm link` to expose the same `skillloom` binary.

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

Skillloom protects the local lifecycle boundary. It rejects symlinks, non-regular files, binary payloads, oversized packages, undeclared executables, unsafe destinations, changed snapshots, and transaction layouts that disagree with durable checkpoints. Mode-aware package hashes cover relative paths, normalized file permissions, and content. Capture validates an isolated staging snapshot before atomically committing the candidate.

Skillloom does not sandbox the host agent, execute semantic analysis, embed an LLM, replace the host runtime, or claim that regex scanning proves behavioral quality. Obfuscated, indirect, novel, or purely natural-language instructions may evade deterministic rules. The host agent and user remain responsible for reviewing requested behavior and granting tool permissions. Scanner rules are deterministic and extensible, while automatic approval only proves that the immutable candidate satisfies the configured structural, capability, and trust policy.

Danger findings always block promotion. Manual warning overrides require both `--accept-warnings` and `--yes`. Executable resources are denied by the default automatic policy even when the package declares them. Live lock owners are never taken over because of elapsed time alone; terminate a genuinely hung owner before recovery.

Hashes created before the mode-aware format remain readable for historical rollback and recovery. Legacy candidates must be recaptured before they can receive the new permission-integrity guarantee.

Runtime state lives under `.skillloom/`: configuration, immutable candidates, learning events, the append-only journal, promotions, operations, backups, staging data, and locks.

## Development

Requirements are Node.js 20 or newer and npm. Claude Code and Codex CLIs are only required for their official plugin validators. CI runs the full lifecycle and packed global-install smoke test on Node.js 20, 22, and 24. CodeQL and Dependabot cover source and dependency changes.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:plugin
npm pack
```

The manual `Publish npm package` workflow uses npm trusted publishing and `--provenance`. Configure the repository, workflow filename, and `npm` environment as a trusted publisher on npm before running it.

Validate the plugin skills directly when changing their instructions:

```bash
python3 /path/to/skill-creator/scripts/quick_validate.py skills/autonomous-learning
python3 /path/to/skill-creator/scripts/quick_validate.py skills/capture-learning
python3 /path/to/skill-creator/scripts/quick_validate.py skills/curate-skills
```
