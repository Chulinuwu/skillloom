# Public roadmap and boundaries

This file tracks product boundaries that are intentionally outside the current supported contract. It is not a release commitment.

## Implemented baseline

- Private Main Hub through host Tailscale Serve.
- Loopback-only Hub and Obsidian Docker services.
- Client Node and This Machine Only setup roles.
- Canonical Markdown Brain with rebuildable SQLite search, a writable managed Obsidian Library projection, and revision-aware Authoring staging.
- Bounded agent episodes, consolidation, workflow evidence, and rejected-update memory.
- Governed workflow-to-skill proof, validation, policy, promotion, rollback, and signed stable releases.
- MCP, HTTP, and local bridge access for Brain and registry operations.

## Evaluation and retrieval work

- Publish reproducible benchmark runs with machine, Node.js, filesystem, corpus, and revision metadata.
- Add datasets for duplicate rejection, conflicting updates, poisoned-note isolation, crash recovery, agent task time, and context-token overhead.
- Evaluate hybrid lexical and local semantic retrieval before choosing an embedding dependency.
- Define reranking, temporal decay, source trust weighting, contradiction handling, entity resolution, duplicate clustering, and multilingual acceptance criteria.
- Replace full startup rebuild with an incremental path only after crash recovery preserves canonical rebuildability.

## Trust and deployment work

- Per-user attribution for Obsidian authoring through an authenticated API-backed editor or plugin. The filesystem bridge records a synthetic local actor.
- Review and quarantine registry channels beyond the current stable reader contract.
- Signing-key rotation, overlap, revocation, client migration, and rollback semantics.
- Byte-range continuation when package sizes justify partial-download recovery.
- Operator-run multi-device Tailnet acceptance and recurring backup and restore drills.
- Hub migration workflows that preserve endpoint trust and signing identity.
- A standalone or bootstrapped client runtime that reduces the Node.js installation requirement without creating a second unsupported distribution contract.

## Explicit non-goals

- Multiple Hub backends before storage ownership and leadership semantics are defined.
- Cloud agents that cannot reach the user's Tailnet.
- Peer-to-peer leader election without a designated Hub.
- Multiple active writers to one Hub data volume.
- Hosted-provider-dependent vector search as a mandatory feature.
- Automatic conversion of arbitrary notes into executable skills.
- Public multi-tenant hosting.
- Browser Obsidian as the primary agent mutation interface.

Track concrete work in GitHub Issues. Architecture documents describe current guarantees; they do not double as an implementation backlog.
