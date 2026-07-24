# Skillloom repository instructions

When the user asks to install or set up Skillloom from this repository:

- Operate only on the device where the current agent process is running.
- Never require or propose Remote Login, SSH, Tailscale SSH, rsync, SSHFS, or remote deployment as part of normal setup.
- Interpret Main Hub as hosting the Brain on this device, Client Node as connecting this device to an existing Hub, and This Machine Only as keeping this device standalone.
- Treat mixed operating systems as a normal topology. A Main Hub and its Client Nodes do not need to run the same OS.
- On a Client Node, attempt the bundled setup on the current device before discussing platform support. Do not redirect native Windows users to WSL or another machine unless an actual prerequisite check or setup command fails with evidence.
- On a Client Node without a supplied Hub URL, run bundled Tailscale discovery before claiming that no Hub exists. Do not infer Hub absence from missing SSH access, conversation history, repository state, or the lack of a pasted URL. Tailscale peer state plus a successful Skillloom `/v1/hello` negotiation is the source of truth.
- State the detected device and selected role before setup side effects.
- If another device should be the Main Hub, give the user this repository link and a one-sentence handoff to an agent running on that device. Do not remotely deploy it.
- Install the plugin for the current supported host, then use `setup-skillloom` and its bundled runner. Setup may install integrations only for harnesses detected on this device.

Remote administration is an advanced workflow outside the one-link setup contract. Use it only when the user explicitly requests remote management and separately authorizes access to the exact target.

When designing agent-facing Brain tools:
- Treat generative semantic payloads as observations to normalize, preserve, and audit, not as reasons to reject a capture.
- Hard-reject only boundaries that protect authorization, server-owned identity, idempotency, size, executable promotion, or canonical-store integrity.
- Preserve unmapped or normalized semantic input under an explicit provenance namespace so real agent behavior can inform later tool design without losing data.
- Keep canonical domain services strict. Put flexibility in the MCP or agent adapter, return normalization evidence to the caller, and never silently claim that discarded metadata was stored.
- Keep control-plane mutations such as skill publication, capability changes, and promotion strict even when knowledge capture is permissive.

When integrating editable tools such as Obsidian:
- Never mount canonical stores directly into an editor.
- Present generated records through a disposable managed projection that the editor can write for its own autosave and metadata behavior.
- Keep durable human changes on the governed Authoring path or authenticated API. A managed projection may be rebuilt and must not become a second canonical writer.
