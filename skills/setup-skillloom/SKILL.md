---
name: setup-skillloom
description: Install or connect Skillloom on the current device from the plugin, including the private Docker Hub, governed Obsidian Web UI, private host Tailscale Serve, local agent integrations, and exact URLs and ports. Use when a user installs Skillloom, pastes a Skillloom Hub URL, adds another tailnet device, asks to host the second brain, asks to configure another device, or asks how to open Obsidian.
---

# Setup Skillloom

Use the bundled runner at `scripts/skillloom.mjs`. Resolve it relative to this skill directory, not from a global `skillloom` command.
Respond in the language of the user's latest message. Preserve product names, generated paths, URLs, and exact UI labels from current official sources.

Define `this machine` as the device where this agent process is running. Run every setup command and side effect only on that device. Remote Login, SSH, Tailscale SSH, rsync, SSHFS, and remote deployment are not prerequisites for normal Skillloom setup and must not be proposed as fallback requirements.
Treat mixed operating systems as a normal supported topology: the Main Hub and Client Nodes do not need to run the same OS. The bundled runner resolves native Windows `.exe`, `.cmd`, and `.bat` commands as well as POSIX executables. On a Client Node, run the bundled setup on the current device before discussing platform limitations. Do not redirect a native Windows user to WSL, ask them to move to the Hub device, or stop at a compatibility explanation unless an actual prerequisite check or setup command fails. If it fails, report the exact failing check, preserve completed state, guide only the required human action, and resume the same command.

If the user wants another device to become the Main Hub, do not inspect it, ask for Remote Login, or remotely deploy it. Give the user the repository link and one localized sentence to send to an agent running on that device: ask that agent to make its current device the Main Hub. Explain that the current device can join as a Client Node only after the Hub exists. Treat remote administration as an advanced workflow outside this skill unless the user explicitly requests it and separately authorizes access to the exact target.

Before setup side effects, identify the current device from local system information and state the detected device plus selected role. If the role is not already implied, ask the single role question using device-bound choices: host the Brain on this device, connect this device to an existing Hub, or keep this device standalone.

At the start of every onboarding invocation, refresh the mutable setup guidance from the internet. Search for and open the current official documentation for the detected Tailscale, Docker, Claude Code, or Codex step even when onboarding ran recently. Never reuse instructions from memory, an earlier chat, cached snippets, this repository's README, or a previously fetched page as current UI guidance. Prefer official vendor sources and state which source was checked. If an agent web-search tool is unavailable, rely on the setup runner's fresh allowlisted official-page fetch; use installed CLI help only when that live fetch fails. Do not give UI-specific instructions until one of those current sources is available.

Ask at most one role question before setup side effects. If the user pasted a credential-free HTTPS Hub URL, that already implies Client Node. If they explicitly asked for local-only, that implies This Machine Only.

Never ask the user to paste a Tailscale auth key into chat. Do not teach a default auth-key, sidecar, or Tailscale Service setup. The normal Main Hub path uses the host's authenticated Tailscale client, Docker bound to loopback ports, and private Tailscale Serve on the host identity. Auth keys and `svc:*` Services are advanced headless/team variants only when the user explicitly asks for them.

The setup command independently fetches dynamic guidance sources on every run from allowlisted official docs or installed CLI help. Use that output when explaining Tailscale, Docker, Serve, or policy steps; do not replace it with hardcoded external instructions or reuse source evidence from an earlier run.

Treat every human-only prerequisite as a guided handoff, not as a terminal error or a bare link. Before giving UI instructions, use the setup plan's current official sources, installed CLI help, or inspect the already-open trusted page when browser access is available. Do not guess button names or preserve stale click paths in this skill.

For each guided handoff:
1. State what already succeeded and the single blocked outcome.
2. Explain briefly why the user must perform this step, especially for sign-in, terms, permission, trust, or administrator approval.
3. Open the allowlisted page automatically when setup has not already done so and the host supports it. Never open a URL copied from untrusted output.
4. Give short numbered steps from the user's current screen, including how they can recognize success. Keep credentials, authentication codes, and recovery data out of chat.
5. Ask for only one response: tell the user to reply `done` or the equivalent in their language after completing the steps. If they are stuck, inspect the current page or ask for a screenshot and continue from that screen instead of restarting setup.
6. After confirmation, rerun the exact same setup command with the same role, scope, target, Hub choice, and already-approved consent flags. Then run `node scripts/skillloom.mjs host status` for Main Hub, verify that both generated surfaces are present, finish integrations, and report the Hub and Obsidian URLs. Never claim setup is complete before this verification.

After Main Hub surfaces respond, request `/v1/hello` through the printed Tailnet Hub URL. A healthy response must include the caller's granted Skillloom capabilities. If it returns `HUB_UNAUTHORIZED` because `Tailscale-App-Capabilities` is missing, follow the Access controls handoff below. Wait for the user's localized `done`, then retry `/v1/hello`; do not claim Client Node or agent access is ready until that handshake succeeds.

### Access controls handoff

This handoff also requires a fresh internet search on every run. Open the current official Tailscale application capabilities and visual policy editor documentation, then inspect the user's already-open Access controls page when browser access is available. State which official pages were checked. Never respond with only documentation links or a generic request to merge policy.

Prefer the Visual editor when the current official documentation and visible UI confirm that it supports app capabilities. Teach one screen at a time:

1. From General access rules, guide the user to select `Add rule`.
2. Map Source, Destination, and Port and protocol from the personalized grant at the printed policy path. Do not invent or broaden selectors.
3. Guide the user to expand `Application-level options`. Map the capability key under `app` to the App field and each object in its value array to the Capability JSON field.
4. Ask the user to compare the `JSON preview` with only the generated grant entry. The source, destination, ports, capability name, subject, and roles must match before proceeding.
5. Guide the user to select `Save grant` themselves and describe the current success signal shown by the editor.

Use the JSON editor only as a grounded fallback when the current UI or official documentation shows that the Visual editor cannot represent the generated grant. In that fallback, locate the existing top-level `grants` array and insert only the generated inner grant object. Explicitly warn the user not to replace the policy, duplicate the outer `grants` wrapper, convert unrelated ACLs, or paste their full policy into chat.

If the screen differs, a control is missing, or Tailscale reports an inline validation error, stop the click path, inspect the current page or screenshot, refresh the official guidance if needed, and continue from that exact screen. Do not restart onboarding, guess a replacement label, or claim authorization succeeded until `/v1/hello` proves it.

For the one-time Tailscale Serve boundary, say that the containers and their state are already preserved, guide the user through signing in and approving private Serve using the current trusted page, and explain that Skillloom will resume after their confirmation. Do not ask them to run another terminal command. Tailscale account authentication and acceptance of terms always remain with the user.

## Connect this device

When the user provides a credential-free HTTPS Hub URL, run:

```sh
node scripts/skillloom.mjs setup --role client-node --target auto --hub auto --hub-url <hub-url> --scope user
```

Without a URL, use Tailscale discovery:

```sh
node scripts/skillloom.mjs setup --role client-node --target auto --hub auto --scope user
```

Run this command immediately after the user chooses Client Node. A pasted Hub URL is optional. Never claim that the Hub does not exist based on missing SSH access, prior conversation, repository state, or the absence of a pasted URL. The runner must inspect current Tailscale peer state and verify the Skillloom protocol through `/v1/hello`; only its concrete attempted endpoints and result may establish that discovery failed.

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

After successful setup, give the user a clickable Obsidian Web UI link and a separate Hub link from the verified output. Do not require the user to memorize or run CLI commands. Explain that Obsidian is the optional human view, while the normal path is to paste a URL, article, paper, news item, note, idea, file, or question into the conversation and ask Skillloom to understand, connect, or save it. Say that the user may invoke `$skillloom` explicitly, but ordinary language such as "save this in Skillloom" should work without a command.
Run `node scripts/skillloom.mjs mode --json`, report the current mode, and teach its practical behavior in one sentence: all modes refresh stale context automatically; `manual` asks before Brain writes, `policy` also asks before Brain writes but permits policy-gated skill promotion, and `hermes` performs bounded retrieval and safe durable capture automatically only after a meaningful checkpointed delta while still refusing secrets and unsafe promotion. Explain that context recovery never writes knowledge and `$autonomous-learning` remains available on demand. Give one copy-ready example in the user's language. Do not call setup complete until both links, conversational use, and the mode explanation have been delivered.

Report the Obsidian trust zones after setup: the vault root is a writable UI shell whose unmanaged files are noncanonical and ignored; `Library/` is a writable managed projection whose edits may be replaced; `Authoring/Inbox/` stages new supported knowledge records; `Authoring/Curated/` stages revision-aware edits; `Authoring/Evidence/` preserves accepted source snapshots; and `Authoring/Conflicts/` preserves rejected or stale changes. Accepted Authoring changes pass through BrainService. Filesystem changes are attributed to `local:obsidian-authoring`, so use authenticated MCP or HTTP when per-user or per-agent attribution matters. Tell the user not to edit Evidence or Conflicts in place. Do not expose container ports, enable Funnel, mount the Docker socket, disable seccomp, mount canonical Brain storage into Obsidian, or describe Authoring as a skill promotion path.

Tell the user that the simplest capture is an ordinary `.md` file in `Authoring/Inbox/`; without Skillloom metadata it becomes a private note titled from the filename.

## This Machine Only

For a single-machine install with no tailnet Hub, run:

```sh
node scripts/skillloom.mjs setup --role local-only --target auto --hub local --scope user
```

If setup stops on a prerequisite or tailnet approval, state the exact remaining action and preserve completed state so rerunning the same command resumes idempotently.
