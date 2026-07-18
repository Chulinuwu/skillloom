# Hermes plugin mode

## Decision

Skillloom adapts Hermes Agent's post-task procedural learning loop as a Claude Code and Codex plugin. It does not fork or embed Hermes Agent's conversation runtime, provider routing, terminal, gateway, or model process.

Claude Code or Codex remains the host agent. Skillloom contributes lifecycle hooks and portable skills that ask the host to classify reusable learning, draft an Agent Skill candidate, and submit it to the existing transactional lifecycle.

## Modes

- `manual`: review is invoked explicitly and promotion requires `--yes`.
- `policy`: review is invoked explicitly and promotion may use `--policy`.
- `hermes`: a Stop hook requests `$autonomous-learning` after the configured cadence, then promotion uses the same policy engine as `policy`.

The default is `manual`. A v0.1 configuration without mode fields is interpreted as the safe v0.2 defaults without rewriting it during a read.

## Learning flow

1. The Stop hook reads project mode and bounded transcript metadata.
2. It exits unless Hermes mode is active and the review cadence is met.
3. It blocks the first stop with a request for `$autonomous-learning`.
4. The host agent decides `no-op`, `memory`, `skill-create`, or `skill-patch`.
5. The agent records a bounded learning event without transcript content.
6. A reusable procedure becomes an immutable candidate and passes structural validation and trust scanning.
7. `--policy` evaluates the candidate hash, targets, scopes, file count, total bytes, executable modes, and findings.
8. Approved candidates enter the existing atomic promotion transaction. Rejected candidates remain available as quarantined review material.
9. `stop_hook_active` allows the second stop and prevents a learning loop.

## Trust boundary

Automatic promotion is not model self-approval. It is a deterministic decision made from the current project configuration and a freshly verified immutable snapshot. The host model cannot supply an approval token or bypass the policy engine.

The default automatic policy permits project-scoped Claude Code and Codex targets only. It rejects generic destinations, user scope, warnings, danger findings, executables, more than 20 files, or more than 256 KiB.

Manual warning overrides remain separate. Danger findings remain non-overridable. Existing base-hash protection, durable journal, staging, compensation, recovery, and rollback remain the mutation boundary.

## Data boundary

Learning events store a short redacted summary, source harness, outcome, timestamp, and optional candidate ID. They do not store full transcripts or credentials.

The `memory` outcome is journey evidence only in v0.2. It is not injected as Claude Code or Codex memory. Behavioral evaluation beyond deterministic validation is also outside v0.2 and must not be implied by an approval result.
