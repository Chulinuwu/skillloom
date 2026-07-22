# Skillloom public roadmap

This file tracks product boundaries that are intentionally not part of the current supported contract. It is not a release commitment.

## Implemented baseline

- Private Main Hub through host Tailscale Serve.
- Loopback-only Hub and Obsidian Docker services.
- Client Node and This Machine Only setup roles.
- Canonical Markdown Brain with rebuildable SQLite search and read-only Obsidian projection.
- Bounded agent episodes, consolidation, workflow evidence, and rejected-update memory.
- Governed workflow-to-skill proof, validation, policy, promotion, rollback, and signed stable releases.
- MCP, HTTP, and local bridge access for Brain and registry operations.

## Open work

- Audited external-revision support for native Obsidian authoring.
- Review and quarantine registry channels beyond the current stable reader contract.
- Byte-range continuation when package sizes justify partial-download recovery.
- Operator-run multi-device Tailnet acceptance and recurring backup and restore drills.
- Hub migration workflows that preserve endpoint trust and signing identity.
- Multiple Hub backends only after storage ownership and leadership semantics are defined.

## Explicitly out of scope for the current contract

- Cloud agents that cannot reach the user's Tailnet.
- Peer-to-peer leader election without a designated Hub.
- Multiple active writers to one Hub data volume.
- Hosted-provider-dependent vector search as a mandatory feature.
- Automatic conversion of arbitrary notes into executable skills.
- Public multi-tenant hosting.
- Browser Obsidian as the primary agent mutation interface.

Track concrete work in GitHub Issues. Architecture documents describe current guarantees; they do not double as an implementation backlog.
