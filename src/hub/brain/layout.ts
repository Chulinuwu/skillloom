import { join } from "node:path";

export function brainLayout(root: string) {
  const vault = join(root, "vault");
  const operations = join(root, "operations");
  const index = join(root, "index");
  const projections = join(root, "projections");
  const obsidianVault = join(projections, "obsidian-vault");
  const obsidianProjection = join(obsidianVault, "Library");
  const obsidianProjectionStaging = join(projections, "obsidian-staging");
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
    obsidianVault,
    obsidianProjection,
    obsidianProjectionNext: join(obsidianProjectionStaging, "next"),
    obsidianProjectionPrevious: join(obsidianProjectionStaging, "previous"),
    obsidianBases: join(root, "obsidian-ui", "Bases"),
    index,
    audit: join(index, "audit.jsonl"),
    sqlite: join(index, "brain.sqlite")
  };
}
