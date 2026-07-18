import type { MutationSubphase } from "./types.js";
import { durableRename } from "./mutation-files.js";
import { observeMutation, type MutationHashes, type MutationTargetPaths } from "./mutation-layout.js";

export type MutationTransition = (state: MutationSubphase, boundary: string) => Promise<void>;

export type MutationRunContext = {
  target: MutationTargetPaths;
  hashes: MutationHashes;
  state: MutationSubphase;
  boundaryPrefix: string;
  transition: MutationTransition;
  afterBoundary?: (boundary: string) => void | Promise<void>;
};

export async function applyMutation(context: MutationRunContext): Promise<void> {
  let state = context.state;
  if (state === "prepared") {
    state = await transition(context, "displace-intent");
  }
  if (state === "displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "prepared" && context.hashes.beforeHash) {
      await durableRename(context.target.destination, context.target.displacedPath);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-displaced-rename`);
    }
    state = await transition(context, "displaced");
  }
  if (state === "displaced") {
    state = await transition(context, "install-intent");
  }
  if (state === "install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "displaced" && context.hashes.afterHash && context.target.stagePath) {
      await durableRename(context.target.stagePath, context.target.destination);
      await context.afterBoundary?.(`${context.boundaryPrefix}:stage-installed-rename`);
    }
    state = await transition(context, "installed");
  }
  await observeMutation(context.target, context.hashes, "installed");
}

export async function revertMutation(context: MutationRunContext): Promise<void> {
  let state = context.state;
  if (state === "prepared" || state === "restored") {
    await observeMutation(context.target, context.hashes, "restored");
    return;
  }
  if (state === "displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    state = await transition(context, observed.layout === "prepared" ? "restored" : "uninstalled");
  }
  if (state === "displaced" || state === "install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    state = await transition(context, observed.layout === "installed" ? "installed" : "uninstalled");
  }
  if (state === "installed") {
    state = await transition(context, "undo-install-intent");
  }
  if (state === "undo-install-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "installed" && context.hashes.afterHash && context.target.stagePath) {
      await durableRename(context.target.destination, context.target.stagePath);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-uninstalled-rename`);
    }
    state = await transition(context, "uninstalled");
  }
  if (state === "uninstalled") {
    state = await transition(context, "undo-displace-intent");
  }
  if (state === "undo-displace-intent") {
    const observed = await observeMutation(context.target, context.hashes, state);
    if (observed.layout === "displaced" && context.hashes.beforeHash) {
      await durableRename(context.target.displacedPath, context.target.destination);
      await context.afterBoundary?.(`${context.boundaryPrefix}:destination-restored-rename`);
    }
    state = await transition(context, "restored");
  }
  await observeMutation(context.target, context.hashes, "restored");
}

function transition(context: MutationRunContext, state: MutationSubphase): Promise<MutationSubphase> {
  return context.transition(state, `${context.boundaryPrefix}:${state}-checkpoint`).then(() => state);
}
