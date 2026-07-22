---
name: setup-skillloom
description: Install or connect Skillloom from the plugin, including the private Docker Hub, read-only Obsidian Web UI, Tailscale services, local agent integrations, and exact URLs and ports. Use when a user installs Skillloom, pastes a Skillloom Hub URL, adds another tailnet device, asks to host the second brain, or asks how to open Obsidian.
---

# Setup Skillloom

Use the bundled runner at `scripts/skillloom.mjs`. Resolve it relative to this skill directory, not from a global `skillloom` command.

Never ask the user to paste a Tailscale auth key into chat. For a first host install, ask them to export `TS_AUTHKEY` in their local terminal environment, then continue after they confirm it is set. The key must be reusable, non-ephemeral, tagged `tag:skillloom-hub`, and treated as a password.

## Connect this device

When the user provides a credential-free HTTPS Hub URL, run:

```sh
node scripts/skillloom.mjs setup --target auto --hub auto --hub-url <hub-url> --scope user
```

Without a URL, use Tailscale discovery:

```sh
node scripts/skillloom.mjs setup --target auto --hub auto --scope user
```

Show the trust preview and obtain consent. Do not add `--yes` unless the user already explicitly approved the displayed Hub identity and installation.

## Host the Hub and Obsidian

Check that Docker Engine with Compose v2 is running. Then run:

```sh
node scripts/skillloom.mjs host install
```

The command creates private state under `~/.skillloom/host`, starts the Hub and Obsidian containers, and prints the generated policy path. The user or a tailnet admin must apply that policy. If automatic service approval is unavailable, approve `svc:skillloom` and `svc:skillloom-obsidian` in the Tailscale admin console.

After approval, run:

```sh
node scripts/skillloom.mjs host status
```

Report both surfaces exactly:

- Hub API: `https://skillloom.<MagicDNSSuffix>` on HTTPS port 443, internal port 8787.
- Obsidian Web UI: `https://skillloom-obsidian.<MagicDNSSuffix>` on HTTPS port 443, internal port 3000.

The Obsidian-mounted Skillloom vault is read-only. Agents and users write Brain records through the authenticated Skillloom MCP or HTTP API so revisions and audit records remain valid. Do not expose container ports, enable Funnel, mount the Docker socket, disable seccomp, or make the Brain vault writable.

If setup stops on a prerequisite or tailnet approval, state the exact remaining action and preserve completed state so rerunning the same command resumes idempotently.
