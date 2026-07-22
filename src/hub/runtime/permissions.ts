import { HubAuthorizationError, type HubPermission } from "../auth/index.js";
import type { BrainActor, BrainPermissionPort } from "../brain/index.js";
import type { RegistryActor, RegistryPermissionPort } from "../registry/index.js";
import { currentHubAuthorizationContext } from "./auth-context.js";

export const OBSIDIAN_AUTHORING_ACTOR_ID = "local:obsidian-authoring";

export function createRuntimeBrainPermissions(): BrainPermissionPort {
  return {
    async requireRead(actor: BrainActor): Promise<void> {
      if (isInProcessAuthoringActor(actor.actorId)) return;
      requireActorPermission(actor.actorId, "brain:read");
    },
    async requireWrite(actor: BrainActor, action): Promise<void> {
      if (
        isInProcessAuthoringActor(actor.actorId)
        && (action === "capture" || action === "update")
      ) return;
      requireActorPermission(actor.actorId, `brain:${action}`);
    }
  };
}

function isInProcessAuthoringActor(actorId: BrainActor["actorId"]): boolean {
  return actorId === OBSIDIAN_AUTHORING_ACTOR_ID && currentHubAuthorizationContext() === undefined;
}

export function createRuntimeRegistryPermissions(): RegistryPermissionPort {
  return {
    async requirePropose(actor: RegistryActor): Promise<void> {
      requireActorPermission(actor.actorId, "skill:propose");
    },
    async requirePublish(actor: RegistryActor): Promise<void> {
      requireActorPermission(actor.actorId, "skill:publish");
    }
  };
}

function requireActorPermission(actorId: BrainActor["actorId"], permission: HubPermission): void {
  const authorization = currentHubAuthorizationContext();
  if (authorization === undefined) throw new HubAuthorizationError(`Actor ${actorId} is not authorized`);
  if (authorization.principal.actorId !== actorId) throw new HubAuthorizationError(`Actor ${actorId} is not authorized for this request`);
  authorization.require(permission);
}
