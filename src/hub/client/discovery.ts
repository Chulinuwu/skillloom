import { DEFAULT_HUB_SERVICE_NAME, parseHubEndpoint, validateHubUrl } from "../config/index.js";
import type { HubEndpointCache, HubEndpointSource } from "../config/index.js";
import { HubDiscoveryConfigurationError } from "./errors.js";

export type HubDiscoveryCandidate = {
  source: HubEndpointSource | "cached";
  endpoint: HubEndpointCache;
  url: string;
};

export type HubDiscoveryResult = {
  mode: "connected";
  endpoint: HubEndpointCache;
  attempted: string[];
} | {
  mode: "local-only";
  attempted: string[];
  endpoint?: never;
};

export type HubDiscoveryOptions = {
  developmentUrl?: string;
  cachedEndpoint?: HubEndpointCache | null;
  magicDnsSuffix?: string;
  probe: (candidate: HubDiscoveryCandidate) => Promise<boolean>;
  now?: () => string;
};

export async function discoverHub(options: HubDiscoveryOptions): Promise<HubDiscoveryResult> {
  const candidates = buildCandidates(options);
  const attempted: string[] = [];
  for (const candidate of candidates) {
    attempted.push(candidate.url);
    if (await options.probe(candidate)) {
      return { mode: "connected", endpoint: candidate.endpoint, attempted };
    }
  }
  return { mode: "local-only", attempted };
}

function buildCandidates(options: HubDiscoveryOptions): HubDiscoveryCandidate[] {
  const candidates: HubDiscoveryCandidate[] = [];
  const verifiedAt = (options.now ?? (() => new Date().toISOString()))();
  if (options.developmentUrl !== undefined) {
    let url: string;
    try {
      url = validateHubUrl(options.developmentUrl, true);
    } catch (error) {
      throw new HubDiscoveryConfigurationError("SKILLLOOM_HUB_URL is unsafe or invalid", { cause: error });
    }
    candidates.push(candidate("development", url, verifiedAt));
  }
  if (options.cachedEndpoint) {
    const endpoint = parseHubEndpoint(options.cachedEndpoint);
    candidates.push({ source: "cached", endpoint, url: endpoint.url });
  }
  if (options.magicDnsSuffix !== undefined) {
    const suffix = normalizeMagicDnsSuffix(options.magicDnsSuffix);
    candidates.push(candidate("service", `https://skillloom.${suffix}`, verifiedAt));
    candidates.push(candidate("host", `https://skillloom-hub.${suffix}`, verifiedAt));
  }
  return deduplicate(candidates);
}

function candidate(source: HubEndpointSource, url: string, verifiedAt: string): HubDiscoveryCandidate {
  const endpoint: HubEndpointCache = { version: 1, source, serviceName: DEFAULT_HUB_SERVICE_NAME, url, verifiedAt };
  return { source, endpoint, url };
}

function normalizeMagicDnsSuffix(value: string): string {
  const suffix = value.trim().replace(/\.$/, "").toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(suffix)) {
    throw new HubDiscoveryConfigurationError("Tailscale MagicDNS suffix is invalid");
  }
  return suffix;
}

function deduplicate(candidates: HubDiscoveryCandidate[]): HubDiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
