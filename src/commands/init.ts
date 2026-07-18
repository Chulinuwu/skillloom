import { mkdir } from "node:fs/promises";
import type { Command } from "../domain/types.js";
import { ensureConfig } from "../config/service.js";
import { storeLayout } from "../store/layout.js";
import { appendEvent } from "../store/journal.js";

export async function initCommand(command: Extract<Command, { command: "init" }>): Promise<{ ok: true; root: string }> {
  const layout = storeLayout(command.root);
  await ensureConfig(command.root);
  await Promise.all([
    mkdir(layout.candidates, { recursive: true }),
    mkdir(layout.promotions, { recursive: true }),
    mkdir(layout.operations, { recursive: true }),
    mkdir(layout.backups, { recursive: true }),
    mkdir(layout.staging, { recursive: true }),
    mkdir(layout.learningEvents, { recursive: true })
  ]);
  await appendEvent(command.root, {
    operationId: `op-init-${Date.now()}`,
    kind: "init",
    phase: "completed",
    evidence: { root: command.root }
  });
  return { ok: true, root: command.root };
}
