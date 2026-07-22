# Skillloom

![Skillloom weaving a private second brain and portable Agent Skills](assets/skillloom-hero.webp)

Private second brain and governed Agent Skill lifecycle for Claude Code, Codex, and every machine in your Tailnet.

[![npm version](https://img.shields.io/npm/v/%40chulinxz%2Fskillloom.svg)](https://www.npmjs.com/package/@chulinxz/skillloom)
[![CI](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml)
[![Node.js 22.16+](https://img.shields.io/badge/node-%3E%3D22.16-339933.svg)](https://nodejs.org/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Skillloom capture, validate, and promote demo](assets/demo.webp)

An agent solves a difficult problem on one machine. A week later, another agent hits the same problem on another machine and starts again from zero. The useful answer existed, but it was trapped in an old session.

Skillloom gives those agents a private second brain that survives sessions and travels across devices. Agents read and write structured Brain records through MCP. People can browse the same knowledge in a hosted Obsidian Web UI. Install the same plugin on another Tailnet machine, connect it to the Hub, and that machine can use the same Brain without sharing a mutable filesystem.

Skills are part of that Brain, but they are not the whole Brain. A note can record what happened or why a decision was made. A skill is a reusable procedure that an agent may execute again. Skillloom keeps that distinction clear: knowledge can be captured as a Brain record, while a skill must pass validation, policy, and an auditable promotion process before it reaches Claude Code or Codex.

The learning loop is adapted from Hermes Agent, but conversations, tools, model routing, and execution stay inside the host agent. Skillloom owns the durable layer: Brain records, immutable skill candidates, trust findings, installation checkpoints, recovery, and rollback.

## Why Skillloom?

Chat history is a poor shared memory. It is tied to one session, full of temporary context, and awkward for another agent to search. Skillloom keeps bounded records such as notes, facts, decisions, sources, projects, and memories. It does not persist full transcripts.

Copying a skill directory installs whatever is there at that moment. It does not preserve what the agent proposed, why it was accepted, what was scanned, which targets changed, or how to safely undo a partial install.

| Plain folder copy | Skillloom |
| --- | --- |
| Mutable source copied directly | Immutable candidate snapshot |
| Review depends on the current agent turn | Deterministic structure and trust scan |
| One destination at a time | Transactional Claude Code and Codex promotion |
| No durable history | Append-only journal and promotion records |
| Manual cleanup after a bad update | Hash-protected rollback and crash recovery |

Local-first means every device keeps its policy, candidates, audit trail, backups, and locks under its own `.skillloom/` store. Skillloom does not require an account, telemetry service, or vendor-hosted control plane. The optional Hub is hosted by you inside your Tailnet, and local workflows keep working when it is unavailable.

## A shared brain inside your Tailnet

The private Hub turns independent Skillloom installations into one shared second brain. A laptop running Codex and a server running Claude Code can use it as long as they are in the same Tailnet and have the required grants. Future agent tools can connect through the same MCP or HTTP boundary. Each client still keeps a local store, so the Hub is a synchronization and access boundary rather than a network-mounted vault.

The Hub service ID is `svc:skillloom`, but clients discover and use the MagicDNS URL `https://skillloom.<MagicDNSSuffix>`, never `https://svc:skillloom`.

The plugin's `$setup-skillloom` workflow is the primary installer. To host the stack, export a reusable tagged `TS_AUTHKEY` locally, never into chat, and let the workflow run `skillloom host install`. It creates private state under `~/.skillloom/host`, starts Docker, and prints the generated tailnet policy path. An admin still owns the explicit policy and Service approval decisions. Do not enable Funnel.

Each client configures trust interactively:

```bash
skillloom setup --target auto --hub auto --scope user
```

Use `--yes` only for explicit noninteractive acceptance. `skillloom sync` imports available Hub records as a dry run, and `skillloom sync --apply` applies them transactionally.

The same Skillloom plugin and bundled MCP bridge work across Claude Code, Codex, and many machines without a separate global CLI install. Each device keeps its own local `.skillloom` root, so offline and local-only workflows continue, and the Hub is not a shared mutable vault mount.

The hosted stack includes a hardened Obsidian Web UI at `https://skillloom-obsidian.<MagicDNSSuffix>` on HTTPS port `443`; its internal container port is `3000`. The Skillloom vault is mounted read-only. Agents and users write through authenticated MCP or HTTP calls so revisions and audit records remain valid. Direct Obsidian, network-share, and filesystem-sync writes remain unsupported until the external-revision adapter exists.

## Quick start

Install the Skillloom plugin on each Claude Code or Codex machine, start a new task, and invoke `$setup-skillloom`. The plugin bundles its setup runner and MCP bridge, so this path does not require a global `skillloom` binary.

On the first host, export a tagged reusable Tailscale auth key in the local terminal, never in chat:

```bash
export TS_AUTHKEY=<tagged-reusable-key>
```

The setup workflow asks for consent, starts the private Docker stack, and prints the generated Tailscale policy path plus both URLs. On every additional machine, invoke the same skill and paste the credential-free Hub URL:

- Hub API: `https://skillloom.<MagicDNSSuffix>` on HTTPS port `443`, internal port `8787`
- Obsidian Web UI: `https://skillloom-obsidian.<MagicDNSSuffix>` on HTTPS port `443`, internal port `3000`

No Docker application port is published to the LAN or internet. Tailscale Serve owns external HTTPS access. The Obsidian vault is read-only; agents write through authenticated Skillloom MCP or HTTP calls so revision and audit history remain valid.

The CLI is optional for people who want direct terminal control:

```bash
npm install --global @chulinxz/skillloom@0.3
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

The plugin is the recommended installation path because it bundles the setup skill, MCP bridge, learning skills, and lifecycle hooks. A global CLI install is optional. For local development, clone the repository and run `npm ci && npm run build` before adding its marketplace.

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

Both harnesses discover the same root `skills/` tree, bundled MCP configuration, and `hooks/hooks.json`. Lifecycle hooks run only after the harness trusts the plugin. Start a new session or task after installation, then invoke `$setup-skillloom`. Do the same after an update or a mode change that affects startup context.

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

Requirements are Node.js 22.16 or newer and npm. Claude Code and Codex CLIs are only required for their official plugin validators. CI runs the full lifecycle and packed global-install smoke test on Node.js 22.16, 24, and 26. CodeQL and Dependabot cover source and dependency changes.

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
python3 /path/to/skill-creator/scripts/quick_validate.py skills/setup-skillloom
```
