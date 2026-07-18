import { posix } from "node:path";
import type { PackageFile } from "../domain/types.js";
import { PathPolicyError, ValidationError } from "../domain/errors.js";
import {
  ABSOLUTE_REFERENCE,
  ABSOLUTE_RESOURCE_REFERENCE,
  AMBIGUOUS_PATH_CHARACTER,
  COMMAND_FLAG_VALUE,
  DEFINITION_LINK,
  DIRECT_RESOURCE_REFERENCE,
  INLINE_CODE,
  INLINE_LINK,
  PLAIN_REFERENCE,
  GENERATED_OUTPUT_LINE,
  RESOURCE_LIKE_REFERENCE,
  URI_SCHEME,
  WINDOWS_ABSOLUTE_PATH
} from "./_reference-patterns.js";

export type SkillResourceReference = {
  path: string;
  line: number;
};

type CandidateReference = {
  value: string;
  column: number;
};

export function extractSkillResourceReferences(skillText: string): SkillResourceReference[] {
  const references: SkillResourceReference[] = [];
  const seen = new Set<string>();
  let fence: "```" | "~~~" | undefined;
  for (const [index, line] of skillText.split(/\r?\n/).entries()) {
    const marker = line.trimStart().slice(0, 3);
    if (fence) {
      if (marker === fence) {
        fence = undefined;
      }
      continue;
    }
    if (marker === "```" || marker === "~~~") {
      fence = marker;
      continue;
    }
    for (const candidate of collectLineCandidates(line).sort((left, right) => left.column - right.column)) {
      const path = normalizeResourceReference(candidate.value);
      if (!path || seen.has(path)) {
        continue;
      }
      seen.add(path);
      references.push({ path, line: index + 1 });
    }
  }
  return references;
}

export function assertResourceReferencesExist(references: SkillResourceReference[], files: PackageFile[]): void {
  const packagePaths = new Set(files.map((file) => file.relativePath));
  for (const reference of references) {
    if (!packagePaths.has(reference.path)) {
      throw new ValidationError(`Referenced resource does not exist: ${reference.path} (SKILL.md:${reference.line})`);
    }
  }
}

function collectLineCandidates(line: string): CandidateReference[] {
  const candidates: CandidateReference[] = [];
  for (const match of line.matchAll(INLINE_LINK)) {
    candidates.push({ value: match[1], column: match.index });
  }
  const definition = DEFINITION_LINK.exec(line);
  if (definition) {
    candidates.push({ value: definition[1], column: definition.index });
  }
  if (GENERATED_OUTPUT_LINE.test(line)) {
    return candidates;
  }
  for (const match of line.matchAll(INLINE_CODE)) {
    const value = match[2].trim();
    if (isDirectResourceCandidate(value) || isAbsoluteResourceCandidate(value)) {
      candidates.push({ value, column: match.index });
    }
  }
  for (const match of line.matchAll(ABSOLUTE_REFERENCE)) {
    addPlainCandidate(candidates, line, match[0], match.index);
  }
  for (const match of line.matchAll(PLAIN_REFERENCE)) {
    addPlainCandidate(candidates, line, match[0], match.index);
  }
  return candidates;
}

function addPlainCandidate(candidates: CandidateReference[], line: string, raw: string, column: number): void {
  const value = trimBoundary(raw);
  const valueColumn = column + raw.lastIndexOf(value);
  if (!COMMAND_FLAG_VALUE.test(line.slice(0, valueColumn))) {
    candidates.push({ value, column: valueColumn });
  }
}

function normalizeResourceReference(input: string): string | undefined {
  let value = input.trim();
  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/[.,;:!?)\]]+$/, "");
  if (!value || value.startsWith("#") || URI_SCHEME.test(value) || value.startsWith("//")) {
    return undefined;
  }
  if (value.includes("\0")) {
    throw new ValidationError("Local resource reference contains NUL");
  }
  if (value.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(value)) {
    throw new PathPolicyError(`Absolute local resource reference is not allowed: ${value}`);
  }
  const fragment = value.indexOf("#");
  if (fragment >= 0) {
    value = value.slice(0, fragment);
  }
  const resourceLike = RESOURCE_LIKE_REFERENCE.test(value);
  if ((AMBIGUOUS_PATH_CHARACTER.test(value) || value.includes("//")) && resourceLike) {
    throw new ValidationError(`Ambiguous local resource reference: ${value}`);
  }
  const normalized = posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new PathPolicyError(`Local resource reference escapes skill package: ${input}`);
  }
  if (!isDirectResourceCandidate(normalized)) {
    if (!resourceLike) {
      return undefined;
    }
    throw new ValidationError(`Ambiguous local resource reference: ${input}`);
  }
  if (normalized.endsWith("/")) {
    throw new ValidationError(`Ambiguous local resource reference: ${input}`);
  }
  return normalized;
}

function trimBoundary(value: string): string {
  return value.trimStart().replace(/^[(["']/, "");
}

function isDirectResourceCandidate(value: string): boolean {
  return DIRECT_RESOURCE_REFERENCE.test(value);
}

function isAbsoluteResourceCandidate(value: string): boolean {
  return ABSOLUTE_RESOURCE_REFERENCE.test(value);
}
