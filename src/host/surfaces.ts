import type { HostResult } from "./types.js";

export function surfacesFromTailscaleStatus(stdout: string): HostResult["surfaces"] {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.MagicDNSSuffix !== "string") return null;
  const suffix = value.MagicDNSSuffix.trim().replace(/\.$/u, "").toLowerCase();
  if (!suffix) return null;
  return {
    hub: { url: `https://skillloom.${suffix}`, externalPort: 443, internalPort: 8787, access: "read-write" },
    obsidian: { url: `https://skillloom-obsidian.${suffix}`, externalPort: 443, internalPort: 3000, access: "read-only" }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
