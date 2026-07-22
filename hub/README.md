# Skillloom private Hub

This compose bundle runs one private Skillloom second-brain Hub and one read-only Obsidian Web UI on a machine that is already signed in to Tailscale. Docker stays local. Tailscale Serve on the host publishes private HTTPS URLs to devices in the same tailnet.

Default surfaces:

- Hub API: host MagicDNS HTTPS port `443`, forwarded to `http://127.0.0.1:8787`
- Obsidian Web UI: same host MagicDNS name on HTTPS port `8443`, forwarded to `http://127.0.0.1:3000`

Requirements:

- Docker Compose v2.
- Tailscale CLI signed in on the host.
- Tailnet policy grants with `skillloom.io/cap/skillloom` app capabilities for users and tagged agents that should read, write, or publish through the Hub.
- On Linux bind mounts, precreate `hub/data` with mode `0700` and ownership for uid `1000`, or equivalent host ownership that lets the runtime image's `node` user read and write it. The backup user must also be able to read it.

Do not enable Funnel. Do not expose Docker ports beyond `127.0.0.1`. Do not mount the Docker socket into Obsidian. Do not make the Brain vault writable inside Obsidian.

## Plugin path

Use the bundled setup skill when possible. It asks only whether this machine is the Main Hub, a Client Node, or This Machine Only, then prints dynamic guidance from allowlisted official docs or installed CLI help. Prefer that generated plan over copied setup steps when Tailscale or Docker behavior changes.

For the Main Hub host:

```sh
skillloom setup --role main-hub --target auto --hub auto --scope user
skillloom host status
```

The Main Hub setup flow creates private state under `~/.skillloom/host`, starts the loopback-only Docker services after consent, configures host Tailscale Serve from the authenticated host session, installs local integrations, and prints both URLs plus the generated policy path if a human or admin needs to update tailnet grants. Use `skillloom host install` only for advanced/manual recovery when the one-flow setup output explicitly says the host stack must be reinstalled.

Auth keys, sidecar Tailscale containers, and `svc:*` Tailscale Services are advanced headless or team variants only. They are not the normal personal setup path, and users should not paste secret-bearing values into chat.

## Manual repository deployment

1. Copy `hub/.env.example` to `hub/.env`.
2. Prepare the data bind mount on Linux if needed:

```sh
mkdir -p hub/data
chmod 700 hub/data
sudo chown 1000:1000 hub/data
```

3. Start the stack:

```sh
docker compose --env-file hub/.env -f hub/compose.yaml up -d --build
```

4. Configure host Tailscale Serve from the authenticated host session. Verify the current syntax with the official Tailscale docs or `tailscale serve --help` before running manual fallback commands:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:8787
tailscale serve --bg --https=8443 http://127.0.0.1:3000
tailscale serve status
```

The Serve status must reference both `127.0.0.1:8787` and `127.0.0.1:3000`, and must not mention Funnel.

## Live acceptance

Run live deployment acceptance only after the stack is started and private Serve is configured. Choose one non-secret run nonce of 16 to 128 safe characters and use the same bare MagicDNS HTTPS Hub origin in every phase:

```sh
RUN_NONCE=acceptance-20260721T120000Z
HUB_URL=https://main-hub.<MagicDNSSuffix>
```

Run the server phase from the Hub Docker host and repository root. It verifies the exact `skillloom-hub` and `obsidian` Compose services, loopback bindings, private Serve configuration, MagicDNS HTTPS, loopback backend reachability for Serve, and persistent host Tailscale plus Hub identities across restart:

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

Aggregation is the only phase that can print `PASS` and exit 0. It requires complete server, contributor, and restricted records with the same run nonce, canonical Hub URL, Hub instance ID, and actor-observed signing-key fingerprint. Missing records exit 3 as incomplete; mismatched or unsafe evidence fails. Records are redacted JSON and never contain Tailscale auth keys, actor login headers, response bodies, request IDs, or signing keys.

## Clients

Each client machine runs interactive Skillloom setup:

```sh
skillloom setup --role client-node --target auto --hub auto --scope user
```

If a credential-free Hub URL was supplied, pass it explicitly:

```sh
skillloom setup --role client-node --target auto --hub auto --hub-url https://main-hub.<MagicDNSSuffix> --scope user
```

The client asks the user to trust the Hub identity and signing key, then keeps its local `.skillloom` state private to that machine. Use `--yes` only when an explicit noninteractive workflow accepts that trust decision.

Before applying the example policy, replace both example email addresses in the `groups` block and their matching `subject: "user:..."` fields. Give ordinary users only `reader` and `contributor`. Give `promoter` only to the named person or small group that may publish a proposed skill as the shared stable release. If someone should become a promoter, move that identity from `group:skillloom-contributors` to `group:skillloom-promoters` and update the matching `subject`; do not place the same email in both groups. Do not replace them with `autogroup:member`, a broad tailnet group, or a catch-all grant unless every tailnet user is intentionally authorized.

For a local-only install without Hub discovery or trust verification:

```sh
skillloom setup --role local-only --target auto --hub local --scope user
```

Import shared Hub records without changing local installs:

```sh
skillloom sync
```

Apply imported changes transactionally:

```sh
skillloom sync --apply
```

The same Skillloom plugin and MCP bridge work for Claude Code, Codex, and any number of client machines. Local `.skillloom` roots remain per-device, so offline and local-only workflows continue without a Hub connection. The Hub is not a shared mutable vault mount.

## Brain and Obsidian boundary

The Hub serves the same Brain and skill registry regardless of local mode. The Hub exposes agent-facing MCP and HTTP APIs plus a hardened Obsidian browser surface. The Brain vault mount inside Obsidian is read-only, terminal and sudo access are disabled, sharing is disabled, and no Docker socket is mounted. Direct Obsidian Desktop, network-share, or filesystem-sync writes to the live vault remain unsupported because they bypass revision and audit enforcement. Native Obsidian authoring remains a deferred synchronization adapter.

Tailscale Serve strips spoofed incoming identity and app-capability headers before forwarding. Human-owned devices can provide a user login header. Tagged devices do not provide a user login, so Skillloom must authorize tagged agents from the signed app capability value, not from IP address or hostname.

## State, backup, and recovery

- `hub/data` contains Hub state: brain Markdown, indexes, audit ledger, registry manifests, and signing keys.
- `hub/obsidian-config` contains the browser desktop profile. It does not contain a writable copy of the Brain vault.

Both directories are intentionally ignored by git.

The safe default is a stopped-Hub snapshot. Do not run `backup.sh` against a live Hub unless the service has already stopped writes. The compose wrapper stops the Hub, runs the snapshot, and starts it again through a trap.

```sh
hub/scripts/backup-compose.sh backups
```

The backup script writes a tarball plus a checksum manifest. Encrypt the resulting tarball with your own backup system if it leaves the machine.

Stop the Hub, restore into an empty data directory, then start it:

```sh
docker compose -f hub/compose.yaml stop skillloom-hub
hub/scripts/restore.sh backups/skillloom-hub-data-YYYYmmddTHHMMSSZ.tar.gz hub/data
docker compose -f hub/compose.yaml start skillloom-hub
```

Hub signing keys are create-once server state. Do not auto-rotate silently. To rotate, export the new public key, update clients through an explicit trust migration, then revoke the old key after every active client has pinned the new key.

If Serve is not configured, rerun `skillloom host install` or the host `tailscale serve` commands above. If the Hub is unhealthy, inspect Hub logs before changing Tailscale settings.
