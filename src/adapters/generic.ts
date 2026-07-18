import type { GenericDirectoryAdapter } from "./types.js";
import { checkDiscoveryRoot } from "./doctor.js";
import { resolveExplicitDestinationRoot, resolveSkillDestination } from "./path-policy.js";
import { canonicalizeGenericRoot } from "./generic-path.js";

export const genericAdapter: GenericDirectoryAdapter = {
  kind: "directory",
  name: "generic",
  resolveRoot(context, destinationRoot) {
    return resolveExplicitDestinationRoot(context.projectRoot, destinationRoot);
  },
  resolveDestination(context, destinationRoot, skillName) {
    return resolveSkillDestination(this.resolveRoot(context, destinationRoot), skillName);
  },
  async doctor(context, destinationRoot) {
    const lexicalRoot = this.resolveRoot(context, destinationRoot);
    const root = await canonicalizeGenericRoot(context, destinationRoot, lexicalRoot);
    return await checkDiscoveryRoot("generic", "explicit", root);
  }
};
