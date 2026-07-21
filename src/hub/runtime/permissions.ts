import { HubAuthorizationError, type HubPermission } from "../auth/index.js";
import type { BrainActor, BrainPermissionPort } from "../brain/index.js";
import type { RegistryActor, RegistryPermissionPort } from "../registry/index.js";
import { currentHubAuthorizationContext } from "./auth-context.js";

export function createRuntimeBrainPermissions(): BrainPermissionPort {
  return {
    async requireRead(actor: BrainActor): Promise<void> {
      requireActorPermission(actor.actorId, "brain:read");
    },
    async requireWrite(actor: BrainActor, action): Promise<void> {
      requireActorPermission(actor.actorId, `brain:${action}`);
    }
  };
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
