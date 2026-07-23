import { createHubAuthorizationService } from "../hub/auth/index.js";
import { createBrainService, type BrainActor, type BrainService } from "../hub/brain/index.js";
import { runWithHubAuthorizationContext } from "../hub/runtime/auth-context.js";
import { createRuntimeBrainPermissions } from "../hub/runtime/permissions.js";

export type EvaluationBrainRuntime = Readonly<{
  brain: BrainService;
  actor(actorId: string): BrainActor;
  runAs<T>(actorId: string, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}>;

export async function createEvaluationBrainRuntime(root: string, actorIds: readonly string[]): Promise<EvaluationBrainRuntime> {
  const authorization = createHubAuthorizationService({
    actorRoles: Object.fromEntries(actorIds.map((actorId) => [actorId, ["contributor"]])),
    capabilityNamespaces: ["skillloom.local/cap/evaluation"]
  });
  const contexts = new Map(actorIds.map((actorId) => [
    actorId,
    authorization.authorize({ actorId, kind: "user", appCapabilities: [] })
  ]));
  const brain = await createBrainService({ root, permissions: createRuntimeBrainPermissions() });
  return {
    brain,
    actor(actorId) {
      requireContext(contexts, actorId);
      return { actorId };
    },
    async runAs(actorId, fn) {
      return await runWithHubAuthorizationContext(requireContext(contexts, actorId), fn);
    },
    async close() {
      await brain.close();
    }
  };
}

function requireContext<T>(contexts: ReadonlyMap<string, T>, actorId: string): T {
  const context = contexts.get(actorId);
  if (context === undefined) throw new Error(`Evaluation actor is not configured: ${actorId}`);
  return context;
}
