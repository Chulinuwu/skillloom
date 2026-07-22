import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BrainArtifact } from "../hub/brain/types.js";
import type { WorkflowGovernanceAction } from "./workflow-governance-types.js";

const maxSteps = 8;
const maxStepLength = 240;

export async function writeWorkflowSkillPackage(
  root: string,
  operationId: string,
  workflow: BrainArtifact,
  action: WorkflowGovernanceAction,
  baseSkillPath?: string
): Promise<string> {
  const name = action === "patch" && baseSkillPath !== undefined ? basename(baseSkillPath) : skillName(workflow.title);
  const packageRoot = join(root, ".skillloom", "staging", `workflow-${safeFragment(operationId)}`, name);
  await mkdir(packageRoot, { recursive: true });
  if (action === "patch" && baseSkillPath !== undefined) {
    await cp(baseSkillPath, packageRoot, { recursive: true });
  }
  const content = action === "patch" && baseSkillPath !== undefined
    ? await patchedSkillText(baseSkillPath, workflow)
    : createdSkillText(name, workflow);
  await writeFile(join(packageRoot, "SKILL.md"), content);
  return packageRoot;
}

export function boundedWorkflowSteps(workflow: BrainArtifact): string[] {
  if (workflow.details.kind !== "workflow") return [];
  return workflow.details.steps.slice(0, maxSteps).map((step) => step.trim().replace(/\s+/gu, " ").slice(0, maxStepLength)).filter((step) => step.length > 0);
}

function createdSkillText(name: string, workflow: BrainArtifact): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${cleanDescription(workflow.title)}`,
    "---",
    "",
    `Use when ${cleanSentence(workflow.details.kind === "workflow" ? workflow.details.trigger : workflow.title)}.`,
    "",
    ...boundedWorkflowSteps(workflow).map((step, index) => `${index + 1}. ${step}`),
    ""
  ].join("\n");
}

async function patchedSkillText(baseSkillPath: string, workflow: BrainArtifact): Promise<string> {
  const base = await readFile(join(baseSkillPath, "SKILL.md"), "utf8");
  return [
    base.trimEnd(),
    "",
    "## Proven Workflow Update",
    "",
    `Use when ${cleanSentence(workflow.details.kind === "workflow" ? workflow.details.trigger : workflow.title)}.`,
    "",
    ...boundedWorkflowSteps(workflow).map((step, index) => `${index + 1}. ${step}`),
    ""
  ].join("\n");
}

function skillName(value: string): string {
  return safeFragment(value).slice(0, 48) || "workflow-skill";
}

function safeFragment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function cleanDescription(value: string): string {
  const cleaned = value.trim().replace(/\s+/gu, " ").slice(0, 120);
  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

function cleanSentence(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 180).replace(/[.]+$/u, "");
}
