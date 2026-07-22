import { join } from "node:path";
import { BACKUPS_DIR, CANDIDATES_DIR, CONFIG_FILE, EVENTS_FILE, JOURNAL_LOCK_DIR, LOCK_DIR, OPERATIONS_DIR, PROMOTIONS_DIR, STAGING_DIR, STORE_DIR } from "../config/defaults.js";

export function storeLayout(projectRoot: string) {
  const root = join(projectRoot, STORE_DIR);
  return {
    root,
    config: join(root, CONFIG_FILE),
    events: join(root, EVENTS_FILE),
    learning: join(root, "learning"),
    learningEvents: join(root, "learning", "events"),
    learningConsolidationJobs: join(root, "learning", "consolidation", "jobs"),
    learningConsolidationProposals: join(root, "learning", "consolidation", "proposals"),
    learningBrainHandoffs: join(root, "learning", "consolidation", "brain-handoffs"),
    candidates: join(root, CANDIDATES_DIR),
    promotions: join(root, PROMOTIONS_DIR),
    operations: join(root, OPERATIONS_DIR),
    backups: join(root, BACKUPS_DIR),
    staging: join(root, STAGING_DIR),
    lock: join(root, LOCK_DIR),
    lockInfo: join(root, LOCK_DIR, "lock.json"),
    journalLock: join(root, JOURNAL_LOCK_DIR)
  };
}
