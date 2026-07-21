import { AsyncLocalStorage } from "node:async_hooks";
import type { HubAuthorizationContext } from "../auth/index.js";

const storage = new AsyncLocalStorage<HubAuthorizationContext>();

export async function runWithHubAuthorizationContext<T>(authorization: HubAuthorizationContext, fn: () => Promise<T>): Promise<T> {
  return await storage.run(authorization, fn);
}

export function currentHubAuthorizationContext(): HubAuthorizationContext | undefined {
  return storage.getStore();
}
