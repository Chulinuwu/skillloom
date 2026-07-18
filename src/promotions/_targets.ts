import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PromotionPolicyError } from "../domain/errors.js";
import { canonicalizeFuturePath } from "../adapters/physical-path.js";
import { canonicalizeGenericRoot } from "../adapters/generic-path.js";
import { resolveSkillDestination } from "../adapters/path-policy.js";
import type { PromotionContext, PromotionTarget, ResolvedPromotionTarget } from "./types.js";

export async function resolvePromotionTargets(
  context: PromotionContext,
  skillName: string,
  targets: PromotionTarget[],
  promotionId: string
): Promise<ResolvedPromotionTarget[]> {
  const resolvedTargets = await Promise.all(targets.map<Promise<ResolvedPromotionTarget>>(async (request) => {
    const scoped = "scope" in request;
    let destination: string;
    if (scoped) {
      const lexicalDestination = resolve(request.adapter.resolveDestination(context, request.scope, skillName));
      destination = await canonicalizeFuturePath(lexicalDestination);
    } else {
      const lexicalRoot = resolve(request.adapter.resolveRoot(context, request.destinationRoot));
      const physicalRoot = await canonicalizeGenericRoot(context, request.destinationRoot, lexicalRoot);
      destination = resolveSkillDestination(physicalRoot, skillName);
    }
    const temporaryPrefix = `.${basename(destination)}.skillloom-${promotionId}`;
    return {
      request,
      scope: scoped ? request.scope : "explicit",
      destination,
      stagePath: join(dirname(destination), `${temporaryPrefix}.stage`),
      displacedPath: join(dirname(destination), `${temporaryPrefix}.previous`)
    };
  }));
  return resolvedTargets.sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}

export function assertSafeDestinations(storeRoot: string, targets: ResolvedPromotionTarget[]): void {
  for (const [index, target] of targets.entries()) {
    if (isWithin(storeRoot, target.destination)) {
      throw new PromotionPolicyError(`Destination cannot be inside the Skillloom store: ${target.destination}`);
    }
    const overlaps = targets.some((other, otherIndex) => otherIndex !== index && (
      isWithin(target.destination, other.destination) || isWithin(other.destination, target.destination)
    ));
    if (overlaps) {
      throw new PromotionPolicyError(`Promotion destinations overlap: ${target.destination}`);
    }
  }
}

function targetKey(target: ResolvedPromotionTarget): string {
  return `${target.request.adapter.name}\0${target.scope}\0${target.destination}`;
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
