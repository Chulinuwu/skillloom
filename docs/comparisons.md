# Comparisons and design influences

Skillloom overlaps with memory and Obsidian tools, but its main boundary is different: remembered content remains data until a proved procedure passes the Agent Skill lifecycle.

## claude-mem

| Concern | claude-mem | Skillloom |
| --- | --- | --- |
| Primary job | Automatic session memory and context continuity | Curated shared knowledge plus governed skill lifecycle |
| Capture | Hooks observe work and compress observations | Bounded Brain records and explicit or Hermes-curated decisions |
| Retrieval | Automatic context injection and memory search | Explicit retrieval in `manual` and `policy`, bounded recall in `hermes` |
| Human surface | Purpose-built memory viewer | Obsidian with writable managed Library and governed Authoring staging |
| Skills | Memory search can be exposed through a skill | Candidate, proof, validation, policy, promotion, recovery, rollback, signed registry |

Short version: claude-mem helps an agent remember what happened. Skillloom helps multiple agents share what is worth keeping and controls when a proved procedure may become executable.

The layers may be complementary, but Skillloom does not claim tested co-installation. Hook ordering, duplicate capture, context injection, latency, and retention need direct integration tests before recommending both as a default stack.

## claude-obsidian

[claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) demonstrates the useful shape of a plain Markdown second brain: source-backed answers, cross-links, methodology-aware organization, and ongoing knowledge hygiene.

Skillloom adopts the human-readable vault idea and adds a governance boundary:

- Human knowledge, agent memory, workflow evidence, and skills belong to one conceptual Brain.
- Markdown remains browsable in Obsidian.
- Human edits enter through revision-aware Authoring staging.
- Agent writes use authenticated tools.
- Accepted writes pass through revisions, provenance, idempotency, and audit.
- A note never becomes executable instruction merely because it exists in the vault.

Skillloom does not currently claim automatic whole-vault organization or claude-obsidian compatibility.

## Plain Markdown, a vector database, or a Git skill repository

Plain Markdown is easy to inspect but does not by itself provide authorization, revision conflicts, idempotency, audit, or a safe memory-to-execution boundary.

A vector database can improve semantic recall, but retrieval quality does not answer who may mutate knowledge or when retrieved prose may become an executable instruction. Skillloom does not currently require hosted vector search.

A Git repository works well for reviewed skills, but it does not automatically model private mutable knowledge, bounded agent memories, rejected proof, cross-device pending writes, or transactional promotion into several host destinations.

These components can complement Skillloom. The project does not claim that one storage or retrieval mechanism replaces every adjacent tool.
