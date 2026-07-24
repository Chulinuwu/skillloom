# Skillloom repository instructions

When the user asks to install or set up Skillloom from this repository:

- Operate only on the device where the current agent process is running.
- Never require or propose Remote Login, SSH, Tailscale SSH, rsync, SSHFS, or remote deployment as part of normal setup.
- Interpret Main Hub as hosting the Brain on this device, Client Node as connecting this device to an existing Hub, and This Machine Only as keeping this device standalone.
- State the detected device and selected role before setup side effects.
- If another device should be the Main Hub, give the user this repository link and a one-sentence handoff to an agent running on that device. Do not remotely deploy it.
- Install the plugin for the current supported host, then use `setup-skillloom` and its bundled runner. Setup may install integrations only for harnesses detected on this device.

Remote administration is an advanced workflow outside the one-link setup contract. Use it only when the user explicitly requests remote management and separately authorizes access to the exact target.
