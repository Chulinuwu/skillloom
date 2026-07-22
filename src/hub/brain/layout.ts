import { join } from "node:path";

export function brainLayout(root: string) {
  const vault = join(root, "vault");
  const operations = join(root, "operations");
  const index = join(root, "index");
  const projections = join(root, "projections");
  const obsidianAuthoring = join(root, "authoring");
  const obsidianAuthoringState = join(operations, "obsidian-authoring");
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
    obsidianAuthoring,
    obsidianAuthoringInbox: join(obsidianAuthoring, "Inbox"),
    obsidianAuthoringCurated: join(obsidianAuthoring, "Curated"),
    obsidianAuthoringEvidence: join(obsidianAuthoring, "Evidence"),
    obsidianAuthoringConflicts: join(obsidianAuthoring, "Conflicts"),
    obsidianAuthoringCheckpoints: join(obsidianAuthoringState, "checkpoints.json"),
    projections,
    obsidianProjection: join(projections, "obsidian"),
    obsidianBases: join(projections, "obsidian", "Bases"),
    index,
    audit: join(index, "audit.jsonl"),
    sqlite: join(index, "brain.sqlite")
  };
}
