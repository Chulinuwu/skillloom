import { dirname, isAbsolute, parse, relative, resolve } from "node:path";
import { PathPolicyError } from "../domain/errors.js";

export function resolveSkillDestination(root: string, skillName: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(skillName)) {
    throw new PathPolicyError(`Unsafe skill name: ${skillName}`);
  }
  const destinationRoot = resolve(root);
  const destination = resolve(destinationRoot, skillName);
  if (dirname(destination) !== destinationRoot) {
    throw new PathPolicyError(`Skill destination escapes discovery root: ${skillName}`);
  }
  return destination;
}

export function assertSafePhysicalDestinationRoot(
  projectRoot: string,
  storeRoot: string,
  destinationRoot: string,
  input: string,
  relativeInput: boolean
): void {
  if (destinationRoot === parse(destinationRoot).root || destinationRoot === projectRoot) {
    throw new PathPolicyError(`Generic destination root is physically too broad: ${input}`);
  }
  if (destinationRoot === storeRoot || isWithin(storeRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root physically uses the Skillloom store: ${input}`);
  }
  if (relativeInput && !isWithin(projectRoot, destinationRoot)) {
    throw new PathPolicyError(`Relative generic destination escapes the physical project: ${input}`);
  }
}
export function resolveExplicitDestinationRoot(projectRoot: string, input: string): string {
  if (!isAbsolute(projectRoot)) {
    throw new PathPolicyError("Adapter project root must be absolute");
  }
  const segments = input.split(/[\\/]+/);
  if (input.length === 0 || input.trim() !== input || input.includes("\0") || segments.includes(".") || segments.includes("..")) {
    throw new PathPolicyError("Generic destination root is empty or malformed");
  }
  const resolvedProjectRoot = resolve(projectRoot);
  const destinationRoot = isAbsolute(input) ? resolve(input) : resolve(resolvedProjectRoot, input);
  if (destinationRoot === parse(destinationRoot).root || destinationRoot === resolvedProjectRoot) {
    throw new PathPolicyError(`Generic destination root is too broad: ${input}`);
  }
  const storeRoot = resolve(resolvedProjectRoot, ".skillloom");
  if (destinationRoot === storeRoot || isWithin(storeRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root cannot use the Skillloom store: ${input}`);
  }
  if (!isAbsolute(input) && !isWithin(resolvedProjectRoot, destinationRoot)) {
    throw new PathPolicyError(`Generic destination root escapes the project: ${input}`);
  }
  return destinationRoot;
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}
