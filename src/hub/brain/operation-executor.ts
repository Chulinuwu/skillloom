import { pendingOperationResult } from "./operation.js";
import type { BrainAuditPort, BrainMetadataIndex, BrainOperationJournalPort, BrainServiceDependencies, BrainSourceStore } from "./ports.js";
import type { BrainMutationResult, BrainPendingOperation } from "./types.js";

export class BrainOperationExecutor {
  constructor(
    private readonly source: BrainSourceStore,
    private readonly audit: BrainAuditPort,
    private readonly journal: BrainOperationJournalPort,
    private readonly index: BrainMetadataIndex,
    private readonly faultInjector?: BrainServiceDependencies["faultInjector"]
  ) {}

  async prepare(operation: Extract<BrainPendingOperation, { action: "capture" | "update" }>): Promise<void> {
    await this.source.stage(operation.operationId, operation.artifact);
    await this.journal.write(operation);
  }

  async finalize(operation: BrainPendingOperation): Promise<BrainMutationResult> {
    if (operation.action !== "link") {
      await this.faultInjector?.("beforeRename", operation);
      await this.source.commit(operation.operationId, operation.artifact, operation.base);
      await this.faultInjector?.("afterRename", operation);
    }
    const event = await this.audit.append(operation.event, pendingOperationResult(operation, "0"));
    await this.faultInjector?.("afterAudit", operation);
    await this.index.commit(operation, event);
    await this.faultInjector?.("afterIndexCommit", operation);
    if (operation.action !== "link") {
      await this.source.cleanupStage(operation.operationId);
    }
    await this.journal.remove(operation.operationId);
    return event.result;
  }

  async recoverPending(): Promise<void> {
    const operations = await this.journal.list();
    for (const operation of operations) {
      await this.finalize(operation);
    }
    await this.source.cleanupOrphanStages(new Set());
  }
}
