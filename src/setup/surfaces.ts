import type { HubSetupDiscovery, SetupSurfaces } from "./types.js";

export function resolveSetupSurfaces(discovery: HubSetupDiscovery): SetupSurfaces | null {
  if (discovery.mode === "local-only") return null;
  const hub = new URL(discovery.endpoint);
  const suffix = serviceSuffix(hub.hostname);
  if (!suffix) return null;
  return {
    hub: { url: hub.origin, externalPort: 443 },
    obsidian: {
      url: `${hub.protocol}//skillloom-obsidian.${suffix}`,
      externalPort: 443,
      internalPort: 3000,
      access: "read-only"
    }
  };
}

function serviceSuffix(hostname: string): string | null {
  for (const prefix of ["skillloom.", "skillloom-hub."]) {
    if (hostname.startsWith(prefix) && hostname.length > prefix.length) return hostname.slice(prefix.length);
  }
  return null;
}
