import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { initCommand } from "../commands/init.js";
import { createEvaluationBrainRuntime } from "../evaluation/brain-runtime.js";
import { runDemoChecks } from "./checks.js";
import { demoAgentA, demoAgentB } from "./scenario.js";
import type { DemoResult } from "./types.js";

export async function runDemo(keep: boolean): Promise<DemoResult> {
  const started = performance.now();
  const workspace = await mkdtemp(join(tmpdir(), "skillloom-demo-"));
  const projectRoot = join(workspace, "project");
  const homeDir = join(workspace, "home");
  const brainRoot = join(workspace, "brain");
  let runtime: Awaited<ReturnType<typeof createEvaluationBrainRuntime>> | null = null;
  try {
    await Promise.all([mkdir(projectRoot), mkdir(homeDir)]);
    await initCommand({ command: "init", root: projectRoot, json: true });
    runtime = await createEvaluationBrainRuntime(brainRoot, [demoAgentA, demoAgentB]);
    const checks = await runDemoChecks(runtime, projectRoot, homeDir);
    return {
      command: "demo",
      workspace,
      workspaceRetained: keep,
      durationMs: roundedDuration(started),
      checks,
      summary: { passed: checks.length, failed: 0 }
    };
  } finally {
    try {
      await runtime?.close();
    } finally {
      if (!keep) await rm(workspace, { recursive: true, force: true });
    }
  }
}

function roundedDuration(started: number): number {
  return Number((performance.now() - started).toFixed(2));
}
