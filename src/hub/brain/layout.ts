import { join } from "node:path";

export function brainLayout(root: string) {
  const vault = join(root, "vault");
  const operations = join(root, "operations");
  const index = join(root, "index");
  const projections = join(root, "projections");
  return {
    root,
    vault,
    inbox: join(vault, "inbox"),
    curated: join(vault, "curated"),
    operations,
    staging: join(operations, "staging"),
    pending: join(operations, "pending"),
    humanInbox: join(operations, "human-inbox"),
    humanInboxCheckpoints: join(operations, "human-inbox", "checkpoints.json"),
    projections,
    obsidianProjection: join(projections, "obsidian"),
    obsidianBases: join(projections, "obsidian", "Bases"),
    index,
    audit: join(index, "audit.jsonl"),
    sqlite: join(index, "brain.sqlite")
  };
}
