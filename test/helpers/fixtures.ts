import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function tempDir(prefix = "skillloom-"): Promise<string> {
  return await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), prefix)));
}

export async function createSkillFixture(root?: string): Promise<string> {
  const dir = root ?? join(await tempDir(), "safe-skill");
  await mkdir(join(dir, "references"), { recursive: true });
  await mkdir(join(dir, "scripts"), { recursive: true });
  await writeFile(join(dir, "SKILL.md"), [
    "---",
    "name: safe-skill",
    "description: Capture safe reusable workflow evidence.",
    "---",
    "",
    "Use references/checklist.md when capturing reusable task evidence.",
    ""
  ].join("\n"));
  await writeFile(join(dir, "references", "checklist.md"), "Keep evidence concise.\n");
  await writeFile(join(dir, "scripts", "noop.sh"), "printf '%s\\n' ok\n");
  return dir;
}
