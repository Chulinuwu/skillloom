import { DEFAULT_HUB_SERVICE_NAME, parseHubEndpoint, validateHubUrl } from "../config/index.js";
import type { HubEndpointCache, HubEndpointSource } from "../config/index.js";
import { HubDiscoveryConfigurationError } from "./errors.js";
import { normalizeMagicDnsSuffix, normalizeTailnetDnsName } from "./magic-dns.js";

export type HubDiscoveryCandidate = {
  source: HubEndpointSource | "cached";
  discovery: "priority" | "tailnet-peer";
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
  tailnetDnsNames?: readonly string[];
  probe: (candidate: HubDiscoveryCandidate) => Promise<boolean>;
  now?: () => string;
};

export async function discoverHub(options: HubDiscoveryOptions): Promise<HubDiscoveryResult> {
  const candidates = buildCandidates(options);
  const attempted: string[] = [];
  for (const candidate of candidates.filter((item) => item.discovery === "priority")) {
    attempted.push(candidate.url);
    if (await options.probe(candidate)) {
      return { mode: "connected", endpoint: candidate.endpoint, attempted };
    }
  }
  const peerCandidates = candidates
    .filter((item) => item.discovery === "tailnet-peer")
    .slice(0, 128);
  attempted.push(...peerCandidates.map((item) => item.url));
  const peerMatches = (await Promise.all(peerCandidates.map(async (item) => await options.probe(item))))
    .map((matched, index) => matched ? peerCandidates[index] : null)
    .filter((item): item is HubDiscoveryCandidate => item !== null);
  if (peerMatches.length > 1) {
    throw new HubDiscoveryConfigurationError(`Multiple Skillloom Hubs were discovered: ${peerMatches.map((item) => item.url).join(", ")}. Rerun setup with --hub-url for the intended Hub.`);
  }
  if (peerMatches[0]) {
    return { mode: "connected", endpoint: peerMatches[0].endpoint, attempted };
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
    candidates.push({ source: "cached", discovery: "priority", endpoint, url: endpoint.url });
  }
  if (options.magicDnsSuffix !== undefined) {
    const suffix = normalizeMagicDnsSuffix(options.magicDnsSuffix);
    candidates.push(candidate("service", `https://skillloom.${suffix}`, verifiedAt));
    candidates.push(candidate("host", `https://skillloom-hub.${suffix}`, verifiedAt));
    for (const value of [...options.tailnetDnsNames ?? []].sort()) {
      const name = normalizeTailnetDnsName(value, suffix);
      if (name) candidates.push(candidate("host", `https://${name}`, verifiedAt, "tailnet-peer"));
    }
  }
  return deduplicate(candidates);
}

function candidate(
  source: HubEndpointSource,
  url: string,
  verifiedAt: string,
  discovery: HubDiscoveryCandidate["discovery"] = "priority"
): HubDiscoveryCandidate {
  const endpoint: HubEndpointCache = { version: 1, source, serviceName: DEFAULT_HUB_SERVICE_NAME, url, verifiedAt };
  return { source, discovery, endpoint, url };
}


function deduplicate(candidates: HubDiscoveryCandidate[]): HubDiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
