import type { HostResult } from "./types.js";
export function surfacesFromTailscaleStatus(stdout: string): HostResult["surfaces"] {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.Self) || typeof value.Self.DNSName !== "string") return null;
  const host = value.Self.DNSName.trim().replace(/\.$/u, "").toLowerCase();
  if (!host) return null;
  return {
    hub: { url: `https://${host}`, externalPort: 443, internalPort: 8787, access: "read-write" },
    obsidian: {
      url: `https://${host}:8443`,
      externalPort: 8443,
      internalPort: 3000,
      workspaces: {
        library: { path: "Library", access: "managed-projection" },
        dashboards: { path: "Bases", access: "writable-ui-state" },
        authoring: { path: "Authoring", access: "writable-staging" }
      }
    }
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
