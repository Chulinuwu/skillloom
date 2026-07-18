import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { collectPackageFiles } from "../files/tree.js";
import { ValidationError } from "../domain/errors.js";
import type { PackageFile, SkillMetadata } from "../domain/types.js";
import { parseSkillMetadata } from "./frontmatter.js";
import { hashPackage } from "./hash.js";
import { scanSkillPackage } from "../security/scan.js";
import { assertResourceReferencesExist, extractSkillResourceReferences, type SkillResourceReference } from "./references.js";

export type SkillValidation = {
  metadata: SkillMetadata;
  files: PackageFile[];
  packageHash: string;
  findings: ReturnType<typeof scanSkillPackage>;
  references: SkillResourceReference[];
};

export type SkillValidationOptions = {
  expectedName?: string;
  folderNamePolicy?: "none" | "match-metadata";
};

export async function validateSkillPackage(root: string, options: SkillValidationOptions = {}): Promise<SkillValidation> {
  const files = await collectPackageFiles(root);
  const skill = files.find((file) => file.relativePath === "SKILL.md");
  if (!skill) {
    throw new ValidationError("Skill package requires SKILL.md");
  }
  const skillText = await readFile(skill.absolutePath, "utf8");
  const metadata = parseSkillMetadata(skillText);
  const references = extractSkillResourceReferences(skillText);
  assertResourceReferencesExist(references, files);
  if (options.expectedName && metadata.name !== options.expectedName) {
    throw new ValidationError(`Skill name mismatch: expected ${options.expectedName}, found ${metadata.name}`);
  }
  if (options.folderNamePolicy === "match-metadata" && basename(resolve(root)) !== metadata.name) {
    throw new ValidationError(`Skill folder name must match frontmatter name: ${metadata.name}`);
  }
  const texts = await Promise.all(files.map(async (file) => ({
    relativePath: file.relativePath,
    text: await readFile(file.absolutePath, "utf8"),
    mode: file.mode
  })));
  return {
    metadata,
    files,
    packageHash: await hashPackage(files),
    findings: scanSkillPackage(texts, new Set(references.map((reference) => reference.path))),
    references
  };
}
