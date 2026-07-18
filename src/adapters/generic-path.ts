import { isAbsolute } from "node:path";
import type { AdapterContext } from "../domain/types.js";
import { storeLayout } from "../store/layout.js";
import { canonicalizeFuturePath } from "./physical-path.js";
import { assertSafePhysicalDestinationRoot } from "./path-policy.js";

export async function canonicalizeGenericRoot(
  context: AdapterContext,
  destinationRoot: string,
  lexicalRoot: string
): Promise<string> {
  const [physicalRoot, physicalProjectRoot, physicalStoreRoot] = await Promise.all([
    canonicalizeFuturePath(lexicalRoot),
    canonicalizeFuturePath(context.projectRoot),
    canonicalizeFuturePath(storeLayout(context.projectRoot).root)
  ]);
  assertSafePhysicalDestinationRoot(
    physicalProjectRoot,
    physicalStoreRoot,
    physicalRoot,
    destinationRoot,
    !isAbsolute(destinationRoot)
  );
  return physicalRoot;
}
