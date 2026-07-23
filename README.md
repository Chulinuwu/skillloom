# Skillloom

![Skillloom weaving a private second brain and portable Agent Skills](assets/skillloom-hero.webp)

Your agents stop relearning the same work, without letting remembered content silently become executable instructions.

Skillloom is a private second brain shared by Claude Code, Codex, and the machines in your Tailnet. Agents can reuse notes, sources, decisions, memories, and verified workflows. Knowledge stays data until proof, validation, policy, and promotion turn a procedure into an Agent Skill.

[![npm version](https://img.shields.io/npm/v/%40chulinxz%2Fskillloom.svg)](https://www.npmjs.com/package/@chulinxz/skillloom)
[![CI](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/Chulinuwu/skillloom/actions/workflows/codeql.yml)
[![Node.js 22.16+](https://img.shields.io/badge/node-%3E%3D22.16-339933.svg)](https://nodejs.org/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## One link is enough

Give this link to Claude Code, Codex, or another coding agent:

`https://github.com/Chulinuwu/skillloom`

Then say:

> Set up Skillloom from this repository. First ask whether this machine should be my Main Hub, a Client Node, or This Machine Only. Handle everything else, pause only when I must sign in or approve something, and verify the Hub and Obsidian links before saying setup is finished.

The agent handles checkout, plugin installation, host integrations, Hub startup or connection, health checks, and final links. A newly installed plugin may require a fresh task before its skills and MCP bridge appear.

If you already know the role, include it in the same message:

- "Make this machine my Main Hub."
- "Connect this machine to `https://<hub-host>`."
- "Keep everything on this machine."

Some vendor-controlled steps still require a person. Skillloom fetches the current official instructions during every onboarding run, opens the relevant page when possible, guides one screen at a time, checkpoints completed work, and resumes after the approval. It never asks you to paste Tailscale secrets into chat.

## The problem it solves

An agent solves a difficult problem on one machine. A week later, another agent meets the same problem elsewhere and starts from zero. The answer existed, but it was trapped in a session log.

Skillloom makes the useful outcome durable. Agents write bounded Brain records through authenticated tools. People browse knowledge and stage notes in a hosted Obsidian Web UI. A workflow that proves reusable can become an immutable candidate, pass validation and policy, and install transactionally in supported agent hosts.

The trust boundary is the product:

```text
observation
  -> knowledge or workflow
  -> verifier proof
  -> immutable candidate
  -> validation and policy
  -> signed release
  -> transactional promotion
```

A note can contain hostile or mistaken instructions and still remain data. It does not become an executable skill merely because an agent remembered it.

## What is stored where

| Layer | Stores | Trust boundary |
| --- | --- | --- |
| Brain | Notes, sources, facts, decisions, project context, memories, workflows | Revisions, provenance, idempotency, authorization, audit |
| Workflow evidence | Outcomes, failures, verifier results, source hashes | Bounded capture and replay-safe records |
| Skill candidates | Immutable proposed packages | Snapshot hash, validation, scanner findings |
| Skill releases | Approved portable Agent Skills | Policy, signature, transactional promotion |
| Obsidian | Read-only Library, writable dashboard state, governed Authoring staging | Accepted changes pass through BrainService |

Every machine keeps local policy, pending operations, backups, installed targets, and cached Hub trust in `.skillloom/`. The optional Hub synchronizes access inside a Tailnet. It is not a shared writable filesystem.

## Talk to it normally

Obsidian is the human view, not a command console. The normal interface is conversation:

- Paste a paper and ask what it changes for the current design.
- Paste a news link and ask for a summary, links to prior knowledge, and whether it is worth keeping.
- Say "Save this in Skillloom" when the current message already identifies what to retain.
- Ask "What does my Brain know about this?"

The agent reads the source, retrieves a bounded set of relevant records, answers first, surfaces connections or conflicts, and handles the save decision according to the active mode.

Invoke `$skillloom` when explicit invocation is useful. A host may expose the same skill as `/skillloom`, but ordinary requests such as "เก็บอันนี้ใน Skillloom" are designed to work without commands. Users do not need to know MCP tool names, schemas, UUIDs, or vault paths.

## Choose how automatic it should be

| Mode | Brain writes | Retrieval | Learning review | Skill promotion |
| --- | --- | --- | --- | --- |
| `manual` | Explicit or one natural confirmation | Explicit | On demand | Manual approval |
| `policy` | Explicit or one natural confirmation | Explicit | On demand | Policy-gated |
| `hermes` | One safe, durable, source-backed outcome may be auto-curated | Bounded automatic recall | Meaningful durable delta | Policy-gated |

New stores default to `manual`.

```bash
skillloom mode hermes
skillloom mode --json
```

Hermes is automatic, not permissionless. Context refresh and learning are separate. A deterministic context capsule expires after its time or tool-call budget and triggers bounded reorientation. Automatic learning needs new, durable work such as an edit followed by verification, multi-step research, or an explicit correction. Cooldowns prevent repeated Stop-hook reviews.

Claude Code can run compatible lifecycle hooks automatically. Codex and other hosts use the same Brain and skills, but invoke unsupported lifecycle moments through the host or user.

## Setup roles

| Role | Use it when | Result |
| --- | --- | --- |
| Main Hub | This machine hosts the shared second brain | Loopback-only Docker stack, private Tailscale Serve, Hub and Obsidian links |
| Client Node | This machine joins an existing Hub | Hub trust verification, Brain access check, release reconciliation, local integrations |
| This Machine Only | Nothing should be shared | Local integrations and local state only |

For an installed plugin, start a fresh task and invoke `$setup-skillloom`. The normal path does not require a global CLI.

Main Hub setup uses the host's authenticated Tailscale session. It never asks for a reusable auth key. Docker privileges, Tailscale login, first-time HTTPS approval, plugin trust, and tailnet policy remain explicit human or administrator decisions.

Successful setup always reports clickable links. The usual Main Hub surfaces are:

- Hub API on private Tailnet HTTPS port `443`.
- Obsidian Web UI on private Tailnet HTTPS port `8443`.

The exact hostname comes from the verified setup result. Docker application ports bind only to loopback. Do not enable Tailscale Funnel for Skillloom.

Detailed setup and recovery procedures live in the [Hub operator guide](hub/README.md).

## Obsidian without bypassing governance

Open the Obsidian link reported by setup from a device in the same Tailnet.

- `Library/` is the generated, read-only canonical projection.
- `Bases/` stores writable Obsidian dashboard state.
- `Authoring/Inbox/` stages new notes.
- `Authoring/Curated/` stages revision-aware edits.
- `Authoring/Evidence/` preserves accepted snapshots.
- `Authoring/Conflicts/` preserves stale or invalid edits.

Accepted captures and updates pass through BrainService. Direct edits to `Library/` or canonical Brain files are unsupported. Browser filesystem events cannot prove the individual Tailnet identity, so Obsidian authoring uses the narrow synthetic actor `local:obsidian-authoring`. Use authenticated MCP or HTTP when individual attribution matters.

Obsidian authoring cannot publish or promote a skill.

## Supported today

| Capability | Status | Current boundary |
| --- | --- | --- |
| Local-only Brain and skill lifecycle | Supported baseline | One machine |
| Main Hub | Supported baseline | One designated Hub and one owned data volume |
| Client Nodes | Supported baseline | Devices that can reach the same Tailnet |
| Shared agent knowledge | Supported baseline | Authenticated MCP or HTTP |
| Obsidian browsing and authoring | Supported baseline | Governed Markdown records, synthetic filesystem actor |
| Claude Code lifecycle hooks | Supported baseline | Automatic where the host exposes compatible hooks |
| Codex and portable agent hosts | Supported baseline | Brain and skills work; unsupported lifecycle moments are invoked |
| Retrieval | Supported baseline | FTS5/BM25 plus graph expansion; no semantic or cross-language guarantee |
| Workflow-to-skill promotion | Supported baseline | Proof, validation, policy, signed release, recovery, rollback |
| Multiple active Hub writers | Not supported | Requires storage ownership and leadership semantics |
| Public multi-tenant hosting | Not supported | Private local or Tailnet deployment only |

The word "baseline" is deliberate. It means the contract is implemented and tested, not that every subsystem has the same scale or field maturity. See the [public roadmap](docs/roadmap.md) for explicit gaps.

## Measure retrieval on your machine

```bash
npm run benchmark:retrieval -- --records 1000 --iterations 5
```

The benchmark builds a real canonical Brain, closes and reopens it, then reports ingest time, cold-start time, query p50 and p95, exact English recall, exact Thai recall, and informational cross-language recall.

For a longer run, give it an explicit workspace:

```bash
npm run benchmark:retrieval -- \
  --records 10000 \
  --iterations 5 \
  --workspace /tmp/skillloom-retrieval-10k
```

Rerun the same command after interruption. Deterministic request IDs and the workspace marker resume the same corpus safely. A different record count is rejected instead of mixing results.

Results are machine-specific. The current benchmark describes lexical retrieval and does not claim semantic search, reranking, multilingual equivalence, or production capacity. See the [benchmark methodology](docs/benchmarks.md).

## How it differs from adjacent tools

`claude-mem` focuses on automatic session memory and context continuity. Skillloom focuses on curated shared knowledge and the governed boundary from remembered procedure to executable skill.

`claude-obsidian` demonstrates the value of a plain Markdown second brain and compounding wiki workflows. Skillloom keeps that human-readable shape while routing accepted agent and Obsidian writes through revisions, provenance, authorization, and audit.

These tools are adjacent, not drop-in replacements. Skillloom does not yet claim tested co-installation or automatic whole-vault organization. See [comparisons and design influences](docs/comparisons.md).

## Security promises

- Remote Brain content is data, never executable instruction by default.
- A candidate is immutable and must match the snapshot that was validated.
- Installation verifies release signatures and package hashes, then uses checkpoints, backups, compensation, recovery, and rollback.

Signatures authenticate a release against the Hub key pinned by the client. They detect changed manifests or packages after signing. They do not protect against a compromised Hub that still controls its signing key. Key rotation and revocation are not automatic in the current baseline, so a changed key stops reconciliation until the client explicitly trusts it again.

Skillloom rejects unsafe destinations, symlinks, non-regular files, binary payloads, oversized packages, undeclared executables, changed snapshots, and transaction layouts that disagree with durable checkpoints. Deterministic scanning does not prove behavioral quality, so the host agent and user still review requested behavior and tool permissions.

Read the full [security and recovery contract](docs/architecture/security.md).

## Architecture and operations

- [Hub topology and client synchronization](docs/architecture/hub.md)
- [Brain and governed skill lifecycle](docs/architecture/brain-and-skills.md)
- [Security, signing, and failure recovery](docs/architecture/security.md)
- [Benchmark methodology](docs/benchmarks.md)
- [Comparisons and design influences](docs/comparisons.md)
- [Public roadmap and explicit boundaries](docs/roadmap.md)
- [Hub operator guide](hub/README.md)

## Plugin installation

The one-link flow is recommended. For manual development installation from the repository root:

Claude Code:

```bash
claude plugin marketplace add .
claude plugin install skillloom@skillloom-dev --scope local
claude plugin details skillloom@skillloom-dev
```

Codex:

```bash
codex plugin marketplace add .
codex plugin add skillloom@skillloom-dev
codex plugin list
```

Start a fresh task after installation or update, then invoke `$setup-skillloom`.

The adapters install skills to:

| Target | Project | User |
| --- | --- | --- |
| Claude Code | `<project>/.claude/skills/<name>` | `~/.claude/skills/<name>` |
| Codex | `<project>/.agents/skills/<name>` | `~/.agents/skills/<name>` |
| Agents | `<project>/.agents/skills/<name>` | `~/.agents/skills/<name>` |
| Generic | `<destination>/<name>` | `<destination>/<name>` |

## Development

Requirements are Node.js 22.16 or newer and npm. Claude Code and Codex CLIs are only required for their official plugin validators. CI tests Node.js 22.16, 24, and 26.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:plugin
npm pack
```

The manual `Publish npm package` workflow uses npm trusted publishing and `--provenance`.
