# Skillloom Hub on Tailscale

This compose bundle runs one private Hub for a tailnet. Tailscale is the only network owner. The Hub binds to `127.0.0.1:8787` inside the shared network namespace, and `tailscale serve` publishes the Tailscale Service `svc:skillloom` at `https://skillloom.<MagicDNSSuffix>` inside the tailnet only. Do not configure clients with `https://svc:skillloom`; `svc:skillloom` is the service identity, not the usable HTTPS discovery URL.

## Prerequisites

- Docker Compose v2.
- Tailscale container image v1.92.0 or newer.
- A reusable tagged auth key allowed to advertise `tag:skillloom-hub`. Do not use an ephemeral key because the Hub must preserve its node identity across container restarts.
- A Tailscale Service named `svc:skillloom`, approved for the tagged device.
- Tailnet policy grants with `skillloom.io/cap/skillloom` app capabilities for the human users and tagged agents that should use the Hub.
- On Linux bind mounts, precreate `hub/data` with mode `0700` and ownership for uid `1000`, or equivalent host ownership that lets the runtime image's `node` user read and write it. The backup user must also be able to read it.

Do not enable Funnel for this service.

## Bootstrap

1. Copy `hub/.env.example` to `hub/.env`.
2. Replace `TS_AUTHKEY` with a fresh reusable tagged auth key.
3. Add or merge `hub/policy.example.hujson` into the tailnet policy and approve the Service.
4. On Linux, prepare the data bind mount before compose creates it as root:

```sh
mkdir -p hub/data
chmod 700 hub/data
sudo chown 1000:1000 hub/data
```

5. Start the stack:

```sh
docker compose --env-file hub/.env -f hub/compose.yaml up -d --build
```

6. Verify:

```sh
docker compose -f hub/compose.yaml ps
docker compose -f hub/compose.yaml exec tailscale tailscale serve status
```

Run live deployment acceptance only after the stack is started and tailnet policy is approved. Choose one non-secret run nonce of 16 to 128 safe characters and use the same MagicDNS HTTPS origin in every phase:

```sh
RUN_NONCE=acceptance-20260721T120000Z
HUB_URL=https://skillloom.<MagicDNSSuffix>
```

Run the server phase from the Hub Docker host and repository root. It verifies the exact `tailscale` and `skillloom-hub` Compose services, private Serve configuration, MagicDNS HTTPS, backend isolation, and persistent Tailscale and Hub identities across restart:

```sh
SKILLLOOM_LIVE_ACCEPTANCE=1 \
SKILLLOOM_ACCEPTANCE_PHASE=server \
SKILLLOOM_ACCEPTANCE_RUN_NONCE="$RUN_NONCE" \
SKILLLOOM_HUB_URL="$HUB_URL" \
hub/scripts/live-acceptance.sh
```

A successful server phase writes `/tmp/skillloom-live-acceptance-$RUN_NONCE/server.json` and exits 3 with `INCOMPLETE`. This is expected because remote actor proof does not exist yet.

Copy only `hub/scripts/live-acceptance.sh` to an authorized contributor machine in the tailnet. The actor phase does not use Docker, Compose, the Hub environment file, or any other repository file:

```sh
chmod 755 ./live-acceptance.sh
SKILLLOOM_LIVE_ACCEPTANCE=1 \
SKILLLOOM_ACCEPTANCE_PHASE=actor \
SKILLLOOM_ACCEPTANCE_ACTOR=contributor \
SKILLLOOM_ACCEPTANCE_RUN_NONCE="$RUN_NONCE" \
SKILLLOOM_HUB_URL="$HUB_URL" \
./live-acceptance.sh
```

The contributor actor must receive the exact contributor `grantedCapabilities` and complete a valid idempotent capture at `POST /v1/brain/captures`. It writes `actor-contributor.json` and exits 3.

Run the same standalone script from a separate reader-only or otherwise restricted tailnet machine:

```sh
SKILLLOOM_LIVE_ACCEPTANCE=1 \
SKILLLOOM_ACCEPTANCE_PHASE=actor \
SKILLLOOM_ACCEPTANCE_ACTOR=restricted \
SKILLLOOM_ACCEPTANCE_RUN_NONCE="$RUN_NONCE" \
SKILLLOOM_HUB_URL="$HUB_URL" \
./live-acceptance.sh
```

The restricted actor must receive exactly `brain:read` and `skill:read`. It proves a valid Brain search succeeds, then sends syntactically valid promotion input with spoofed Tailscale identity and app-capability headers to `POST /v1/registry/releases`; the required result is HTTP 403. It writes `actor-restricted.json` and exits 3.

Copy both actor records to the server evidence directory without making them group- or world-readable. Each input file must be mode `0600`, its immediate directory mode `0700`, and neither may be a symlink:

```sh
EVIDENCE_DIR=/tmp/skillloom-live-acceptance-$RUN_NONCE
chmod 700 "$EVIDENCE_DIR"
install -m 600 /path/from-contributor/actor-contributor.json "$EVIDENCE_DIR/actor-contributor.json"
install -m 600 /path/from-restricted/actor-restricted.json "$EVIDENCE_DIR/actor-restricted.json"
SKILLLOOM_LIVE_ACCEPTANCE=1 \
SKILLLOOM_ACCEPTANCE_PHASE=aggregate \
SKILLLOOM_ACCEPTANCE_RUN_NONCE="$RUN_NONCE" \
SKILLLOOM_HUB_URL="$HUB_URL" \
SKILLLOOM_ACCEPTANCE_EVIDENCE_DIR="$EVIDENCE_DIR" \
hub/scripts/live-acceptance.sh
```

Aggregation is the only phase that can print `PASS` and exit 0. It requires complete server, contributor, and restricted records with the same run nonce, canonical Hub URL, Hub instance ID, and actor-observed signing-key fingerprint. Missing records exit 3 as incomplete; mismatched or unsafe evidence fails. Records are redacted JSON and never contain Tailscale auth keys, actor login headers, response bodies, request IDs, or signing keys. A live run was not possible in the development environment used to build this harness, so operator-produced aggregate evidence remains a deployment gate.

Before applying the example policy, replace both example email addresses in the `groups` block and their matching `subject: "user:..."` fields. A user's devices receive the app capability because the policy `src` is that user's group, so no per-device policy grant is needed.

Give ordinary users only `reader` and `contributor`: they can search, capture, update, link, read skills, and propose a skill release. Give `promoter` only to the named person or small group that may publish a proposed skill as the shared stable release. A promoter grant must contain `reader`, `contributor`, and `promoter`, as the example does.

Each human identity must appear in exactly one Skillloom app-capability grant. If someone should become a promoter, move that identity from `group:skillloom-contributors` to `group:skillloom-promoters` and update the matching `subject`; do not place the same email in both groups. The Hub rejects conflicting role arrays rather than guessing which privilege applies. Keep the groups explicitly named. Do not replace them with `autogroup:member`, a broad tailnet group, or a catch-all grant unless every tailnet user is intentionally authorized.

Each client machine then runs interactive Skillloom setup:

```sh
skillloom setup --target auto --hub auto --scope user
```

The client discovers `svc:skillloom`, uses `https://skillloom.<MagicDNSSuffix>` as the Hub URL, asks the user to trust the Hub identity and signing key, and keeps its local `.skillloom` state private to that machine. Use `--yes` only when an explicit noninteractive workflow accepts that trust decision.

If you intentionally want a local-only install without Hub discovery or trust verification, run:

```sh
skillloom setup --target auto --hub local --scope user
```

`--hub auto` fails clearly when the Hub is unreachable or Brain read verification is denied; it does not silently report a local-only Hub setup.

Import shared Hub records without changing local installs:

```sh
skillloom sync
```

Apply imported changes transactionally:

```sh
skillloom sync --apply
```

The same Skillloom plugin and MCP bridge work for Claude Code, Codex, and any number of client machines. Local `.skillloom` roots remain per-device, so offline and local-only workflows continue without a Hub connection. The Hub is not a shared mutable vault mount.

The Hub currently exposes agent-facing MCP and HTTP APIs, not an Obsidian browser UI. Direct Obsidian Desktop, network-share, or filesystem-sync writes to the live vault are unsupported because they bypass revision and audit enforcement. Obsidian authoring remains a separate deferred synchronization adapter.

## Identity model

Tailscale Serve strips spoofed incoming identity and app-capability headers before forwarding. Human-owned devices can provide a user login header. Tagged devices do not provide a user login, so Skillloom must authorize tagged agents from the signed app capability value, not from IP address or hostname.

## Persistence

- `hub/data` contains Hub state: brain Markdown, indexes, audit ledger, registry manifests, and signing keys.
- `hub/tailscale-state` contains the node key and Tailscale state.

Both directories are intentionally ignored by git.

## Backup

The safe default is a stopped-Hub snapshot. Do not run `backup.sh` against a live Hub unless the service has already stopped writes. The compose wrapper stops the Hub, runs the snapshot, and starts it again through a trap.

```sh
hub/scripts/backup-compose.sh backups
```

The backup script writes a tarball plus a checksum manifest. Encrypt the resulting tarball with your own backup system if it leaves the machine.

## Restore

Stop the Hub, restore into an empty data directory, then start it:

```sh
docker compose -f hub/compose.yaml stop skillloom-hub
hub/scripts/restore.sh backups/skillloom-hub-data-YYYYmmddTHHMMSSZ.tar.gz hub/data
docker compose -f hub/compose.yaml start skillloom-hub
```

## Key rotation

Hub signing keys are create-once server state. Do not auto-rotate silently. To rotate, export the new public key, update clients through an explicit trust migration, then revoke the old key after every active client has pinned the new key.

## Failure recovery

- If Serve is not configured, rerun the tailscale container. The entrypoint reapplies `tailscale serve` idempotently.
- If the Hub is unhealthy, keep Tailscale running and inspect Hub logs first.
- If `svc:skillloom` resolves to an unexpected identity, clients must fail closed and require explicit trust reset.
