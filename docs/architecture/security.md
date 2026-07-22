# Security and recovery

## Identity and authorization

Tailscale provides transport identity. Skillloom enforces application authorization.

Tailscale Serve must:

- Terminate private Tailnet HTTPS.
- Remove spoofed identity and capability headers.
- Forward only configured application capabilities.
- Proxy only to loopback Hub and Obsidian backends.
- Never enable Funnel for Skillloom.

Being in the same Tailnet is necessary but not sufficient for mutation or promotion access.

| Role | Brain access | Skill access |
| --- | --- | --- |
| Reader | Search and read | List and fetch approved releases |
| Contributor | Reader plus inbox capture and revision-checked edits | Propose immutable candidates |
| Promoter | Contributor | Publish validated releases allowed by policy |
| Admin | Retention, roles, recovery, and keys | Channels and trust policy |

## Security invariants

- No public Hub endpoint or Tailscale Funnel.
- No Hub or Obsidian Docker port bound beyond host loopback.
- No shared Brain vault or `.skillloom` network mount.
- No trust based only on source IP or caller-supplied headers.
- No Brain artifact executes as instruction without governed promotion.
- No candidate publishes without validation of its immutable snapshot.
- No release installs without hash and signature verification.
- No automatic promotion broadens declared capabilities beyond local policy.
- No secret, raw credential, full transcript, or unbounded tool output is stored as learning evidence.
- No changed Hub identity or signing key is trusted automatically.
- No destructive deletion is exposed through the normal Brain MCP surface.

## Effective permission

Effective permission is the intersection of:

1. Tailscale transport identity and tailnet reachability.
2. Hub application capabilities.
3. Release policy.
4. Local machine policy.

A client can narrow permissions but cannot broaden them.

## Failure recovery

| Failure | Required behavior |
| --- | --- |
| Hub unreachable | Installed skills continue working; pending writes remain durable |
| Interrupted download | Retry, verify the package hash, and materialize atomically |
| Interrupted local promotion | Resume or compensate through the local transaction journal |
| Interrupted Hub upload | Replay with the same idempotency key and recover or expire staging |
| Interrupted Brain write | Recover staging or preserve the prior revision |
| Duplicate request | Return the recorded idempotent result |
| Concurrent Brain update | Return a revision conflict without data loss |
| Divergent skill patches | Preserve both candidates and require explicit resolution |
| Index corruption | Rebuild from canonical Markdown and durable audit state |
| Changed signing key | Stop reconciliation and require explicit re-trust |

## Secret handling

The default Main Hub path uses the host's existing authenticated Tailscale session. It does not ask the user to paste a reusable auth key into chat or persist one in Skillloom state.

Runtime setup guidance is fetched only from allowlisted official documentation or installed CLI help. Retrieved snippets are treated as untrusted data, sanitized, hashed, and attached to a typed plan. Human-only authority steps remain explicit.

## Reporting security issues

Do not place credentials, private Tailnet names, signing keys, or sensitive Brain content in public issues. Report a minimal reproduction that preserves the affected trust boundary and redacts private data.
