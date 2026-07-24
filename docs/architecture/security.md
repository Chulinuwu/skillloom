# Security and recovery

## Identity and authorization

# Security and recovery

## Network and authorization boundary

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

The Obsidian filesystem bridge is a narrower local principal, not a Tailnet role. It records accepted filesystem writes as `local:obsidian-authoring` and can only capture or update supported Brain records. It cannot link records, propose candidates, publish releases, or promote skills. Use authenticated MCP or HTTP when an individual human or agent identity must appear in provenance and audit events.

## Security invariants

- No public Hub endpoint or Tailscale Funnel.
- No Hub or Obsidian Docker port bound beyond host loopback.
- No shared canonical Brain vault or `.skillloom` network mount.
- No unmanaged file in the writable Obsidian vault shell becomes canonical or enters the authoring bridge.
- No direct write access to canonical Brain files. Obsidian may write to the disposable `Library/` projection, but those writes are never authoritative.
- No Obsidian Authoring write can publish or promote a skill.
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

## Signing and key lifecycle

The Hub creates one native Ed25519 registry signing key at first startup. The private key is stored as `runtime/registry-signing-key.pem` in the persistent Hub data volume with mode `0600`. The Hub instance ID is created once beside it. Backups and migrations must preserve both values as one trust identity.

During explicit Hub trust, each client pins the Hub instance ID and the SHA-256 fingerprint of the advertised public key. Reconciliation verifies the canonical signed payload, fingerprint, Hub instance ID, monotonic registry sequence, and package hash before materializing a release.

The signature proves that the exact registry payload came from the holder of the pinned private key and was not changed afterward. It does not make the release behavior safe, replace validation or policy, identify the human promoter by itself, or protect against a compromised Hub that can use the signing key.

The current baseline does not rotate or revoke keys automatically. If the Hub identity or key changes, clients stop reconciliation and require explicit re-trust. Deleting the key creates a new trust root and should be treated as a recovery event, not routine maintenance. Planned rotation must define overlap, revocation, client migration, and rollback semantics before implementation.

## Failure behavior

## Failure recovery

| Failure | Required behavior |
| --- | --- |
| Hub unreachable | Installed skills continue working; pending writes remain durable |
| Interrupted download | Retry, verify the package hash, and materialize atomically |
| Interrupted local promotion | Resume or compensate through the local transaction journal |
| Interrupted Hub upload | Replay with the same idempotency key and recover or expire staging |
| Interrupted Brain write | Recover staging or preserve the prior revision |
| Interrupted Obsidian Authoring sync | Preserve staged input and retry from its checkpoint |
| Duplicate request | Return the recorded idempotent result |
| Concurrent Brain update | Return a revision conflict without data loss |
| Stale or invalid Obsidian edit | Preserve it in Authoring conflicts without changing canonical data |
| Divergent skill patches | Preserve both candidates and require explicit resolution |
| Index corruption | Rebuild from canonical Markdown and durable audit state |
| Changed signing key | Stop reconciliation and require explicit re-trust |

## Secret handling

The default Main Hub path uses the host's existing authenticated Tailscale session. It does not ask the user to paste a reusable auth key into chat or persist one in Skillloom state.

Runtime setup guidance is fetched only from allowlisted official documentation or installed CLI help. Retrieved snippets are treated as untrusted data, sanitized, hashed, and attached to a typed plan. Human-only authority steps remain explicit.

## Reporting security issues

Do not place credentials, private Tailnet names, signing keys, or sensitive Brain content in public issues. Report a minimal reproduction that preserves the affected trust boundary and redacts private data.
