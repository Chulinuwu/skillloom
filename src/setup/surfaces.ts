import type { HubSetupDiscovery, SetupSurfaces } from "./types.js";
export function resolveSetupSurfaces(discovery: HubSetupDiscovery): SetupSurfaces | null {
  if (discovery.mode === "local-only") return null;
  const hub = new URL(discovery.endpoint);
  const obsidian = new URL(hub.origin);
  obsidian.port = "8443";
  return {
    hub: { url: hub.origin, externalPort: 443 },
    obsidian: {
      url: obsidian.origin,
      externalPort: 8443,
      internalPort: 3000,
      access: "read-only"
    }
  };
}
