import { HubDiscoveryConfigurationError } from "./errors.js";

const DNS_NAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeMagicDnsSuffix(value: string): string {
  const suffix = normalizeDnsName(value);
  if (!suffix) throw new HubDiscoveryConfigurationError("Tailscale MagicDNS suffix is invalid");
  return suffix;
}

export function normalizeTailnetDnsName(value: unknown, suffix: string): string | null {
  if (typeof value !== "string") return null;
  const name = normalizeDnsName(value);
  if (!name || !name.endsWith(`.${suffix}`)) return null;
  return name;
}

function normalizeDnsName(value: string): string | null {
  const name = value.trim().replace(/\.$/u, "").toLowerCase();
  return DNS_NAME_PATTERN.test(name) ? name : null;
}
