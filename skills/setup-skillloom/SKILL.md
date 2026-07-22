---
name: setup-skillloom
description: Install or connect Skillloom from the plugin, including the private Docker Hub, read-only Obsidian Web UI, private host Tailscale Serve, local agent integrations, and exact URLs and ports. Use when a user installs Skillloom, pastes a Skillloom Hub URL, adds another tailnet device, asks to host the second brain, or asks how to open Obsidian.
---

# Setup Skillloom

Use the bundled runner at `scripts/skillloom.mjs`. Resolve it relative to this skill directory, not from a global `skillloom` command.

Ask at most one role question before setup side effects: is this machine the Main Hub, a Client Node, or This Machine Only? If the user pasted a credential-free HTTPS Hub URL, that already implies Client Node. If they explicitly asked for local-only, that implies This Machine Only.

Never ask the user to paste a Tailscale auth key into chat. Do not teach a default auth-key, sidecar, or Tailscale Service setup. The normal Main Hub path uses the host's authenticated Tailscale client, Docker bound to loopback ports, and private Tailscale Serve on the host identity. Auth keys and `svc:*` Services are advanced headless/team variants only when the user explicitly asks for them.

The setup command emits dynamic guidance sources from allowlisted official docs or installed CLI help. Use that output when explaining Tailscale, Docker, Serve, or policy steps; do not replace it with hardcoded external instructions.

## Connect this device

When the user provides a credential-free HTTPS Hub URL, run:

```sh
node scripts/skillloom.mjs setup --role client-node --target auto --hub auto --hub-url <hub-url> --scope user
```

Without a URL, use Tailscale discovery:

```sh
node scripts/skillloom.mjs setup --role client-node --target auto --hub auto --scope user
```

Show the trust preview and obtain consent. Do not add `--yes` unless the user already explicitly approved the displayed Hub identity and installation.

## Host the Hub and Obsidian

For Main Hub, run the single setup flow:

```sh
node scripts/skillloom.mjs setup --role main-hub --target auto --hub auto --scope user
```

This command obtains the combined consent it needs, installs local agent integrations, creates private state under `~/.skillloom/host`, starts the Hub and Obsidian containers, configures private Tailscale Serve from the host Tailscale session, and prints both URLs. If Docker, Tailscale login, plugin trust, or tailnet ACL/app-cap policy changes are required, report that exact human/admin action and preserve resumable state.

After setup reports success, run:

```sh
node scripts/skillloom.mjs host status
```

Use `node scripts/skillloom.mjs host install` only for advanced/manual recovery when the one-flow setup output explicitly says the host stack must be reinstalled.

Report both surfaces from command output, not from guessed hostnames:

- Hub API: host MagicDNS HTTPS port 443, internal port 8787.
- Obsidian Web UI: same host MagicDNS name on HTTPS port 8443, internal port 3000.

The Obsidian-mounted Skillloom vault is read-only. Agents and users write Brain records through the authenticated Skillloom MCP or HTTP API so revisions and audit records remain valid. Do not expose container ports, enable Funnel, mount the Docker socket, disable seccomp, or make the Brain vault writable.

## This Machine Only

For a single-machine install with no tailnet Hub, run:

```sh
node scripts/skillloom.mjs setup --role local-only --target auto --hub local --scope user
```

If setup stops on a prerequisite or tailnet approval, state the exact remaining action and preserve completed state so rerunning the same command resumes idempotently.
