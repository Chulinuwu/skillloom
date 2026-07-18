import { ValidationError } from "../domain/errors.js";
import type { MutationSubphase } from "./types.js";
import { hashSkillDirectory, pathExists } from "../promotions/files.js";

export type MutationTargetPaths = {
  destination: string;
  stagePath: string | null;
  displacedPath: string;
};

export type MutationHashes = {
  beforeHash: string | null;
  afterHash: string | null;
};

export type MutationLayout = "prepared" | "displaced" | "installed";

export type MutationPathHashes = {
  destinationHash: string | null;
  stageHash: string | null;
  displacedHash: string | null;
};

export type MutationObservation = MutationPathHashes & {
  layout: MutationLayout;
};

export async function observeMutation(
  target: MutationTargetPaths,
  hashes: MutationHashes,
  state: MutationSubphase
): Promise<MutationObservation> {
  const observed = await inspectMutationPaths(target);
  const layouts = matchingMutationLayouts(observed, hashes);
  const allowed = allowedLayouts(state);
  const layout = allowed.find((item) => layouts.includes(item));
  if (!layout) {
    throw new ValidationError(`Mutation layout mismatch at ${target.destination}: recorded ${state}, observed ${JSON.stringify(observed)}`);
  }
  return { layout, ...observed };
}

export async function inspectMutationPaths(target: MutationTargetPaths): Promise<MutationPathHashes> {
  return {
    destinationHash: await hashAt(target.destination),
    stageHash: target.stagePath ? await hashAt(target.stagePath) : null,
    displacedHash: await hashAt(target.displacedPath)
  };
}

export function matchingMutationLayouts(observed: MutationPathHashes, hashes: MutationHashes): MutationLayout[] {
  const layouts: MutationLayout[] = [];
  if (matches(observed.stageHash, hashes.afterHash) && matches(observed.destinationHash, hashes.beforeHash) && observed.displacedHash === null) {
    layouts.push("prepared");
  }
  if (matches(observed.stageHash, hashes.afterHash) && observed.destinationHash === null && matches(observed.displacedHash, hashes.beforeHash)) {
    layouts.push("displaced");
  }
  if (observed.stageHash === null && matches(observed.destinationHash, hashes.afterHash) && matches(observed.displacedHash, hashes.beforeHash)) {
    layouts.push("installed");
  }
  return layouts;
}

function allowedLayouts(state: MutationSubphase): MutationLayout[] {
  if (state === "prepared" || state === "restored") {
    return ["prepared"];
  }
  if (state === "displace-intent" || state === "undo-displace-intent") {
    return ["prepared", "displaced"];
  }
  if (state === "displaced" || state === "uninstalled") {
    return ["displaced"];
  }
  if (state === "install-intent" || state === "undo-install-intent") {
    return ["displaced", "installed"];
  }
  return ["installed"];
}

function matches(actual: string | null, expected: string | null): boolean {
  return actual === expected;
}

async function hashAt(path: string): Promise<string | null> {
  return await pathExists(path) ? await hashSkillDirectory(path) : null;
}
