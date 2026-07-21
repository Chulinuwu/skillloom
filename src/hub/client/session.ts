import {
  readHubEndpoint,
  readHubTrust,
  writeHubEndpoint,
  writeHubTrust,
  type HubEndpointCache
} from "../config/index.js";
import type { NegotiationResponse } from "../protocol/index.js";
import { discoverHub } from "./discovery.js";
import { HubHttpError, HubTimeoutError, HubTrustNotEstablishedError, HubUnavailableError } from "./errors.js";
import { negotiateHub } from "./negotiation.js";
import { readTailscaleMagicDnsSuffix, type TailscaleStatusProcess } from "./tailscale-status.js";
import type { HubHttpClient } from "./transport-types.js";
import { establishHubTrust, verifyHubTrust, type ExplicitHubTrustConsent } from "./trust.js";

export type HubClientFactory = (baseUrl: string) => HubHttpClient;

type HubSessionOptions = Readonly<{
  root: string;
  clientVersion: string;
  createClient: HubClientFactory;
  tailscaleStatus?: TailscaleStatusProcess;
  developmentUrl?: string;
  now?: () => string;
}>;

export type ConnectedHubSession = Readonly<{
  mode: "connected";
  endpoint: HubEndpointCache;
  negotiation: NegotiationResponse;
  client: HubHttpClient;
  attempted: readonly string[];
}>;

export type HubSession = ConnectedHubSession | Readonly<{
  mode: "local-only";
  attempted: readonly string[];
}>;

export type SetupHubSessionOptions = HubSessionOptions & Readonly<{
  consent: ExplicitHubTrustConsent;
}>;

export async function setupHubSession(options: SetupHubSessionOptions): Promise<ConnectedHubSession> {
  const preview = await previewHubSession(options);
  await trustHubSession(options.root, preview, options.consent);
  return preview;
}

export async function previewHubSession(options: HubSessionOptions): Promise<ConnectedHubSession> {
  const resolved = await resolveSession(options, false);
  if (resolved.mode === "local-only") throw new HubUnavailableError("Skillloom Hub could not be verified during setup");
  return resolved;
}

export async function trustHubSession(
  root: string,
  preview: ConnectedHubSession,
  consent: ExplicitHubTrustConsent
): Promise<void> {
  const trust = establishHubTrust(preview.negotiation, consent);
  await writeHubTrust(root, trust);
  await writeHubEndpoint(root, preview.endpoint);
}

export async function openHubSession(options: HubSessionOptions): Promise<HubSession> {
  const trust = await readHubTrust(options.root);
  if (!trust) throw new HubTrustNotEstablishedError();
  return await resolveSession(options, true);
}

async function resolveSession(options: HubSessionOptions, verifyOnly: boolean): Promise<HubSession> {
  const cachedEndpoint = await readHubEndpoint(options.root);
  const magicDnsSuffix = await optionalMagicDnsSuffix(options.tailscaleStatus);
  const negotiated = new Map<string, { client: HubHttpClient; response: NegotiationResponse }>();
  const trust = verifyOnly ? await readHubTrust(options.root) : null;
  const discovery = await discoverHub({
    ...(options.developmentUrl === undefined ? {} : { developmentUrl: options.developmentUrl }),
    cachedEndpoint,
    ...(magicDnsSuffix === undefined ? {} : { magicDnsSuffix }),
    ...(options.now === undefined ? {} : { now: options.now }),
    probe: async (candidate) => {
      const client = options.createClient(candidate.url);
      try {
        const response = await negotiateHub(client, options.clientVersion);
        if (verifyOnly) verifyHubTrust(trust, response);
        negotiated.set(candidate.url, { client, response });
        return true;
      } catch (error) {
        if (isUnavailableCandidate(error)) return false;
        throw error;
      }
    }
  });
  if (discovery.mode === "local-only") return discovery;
  const value = negotiated.get(discovery.endpoint.url);
  if (!value) throw new HubUnavailableError("Skillloom Hub negotiation did not complete");
  if (verifyOnly) await writeHubEndpoint(options.root, discovery.endpoint);
  return {
    mode: "connected",
    endpoint: discovery.endpoint,
    negotiation: value.response,
    client: value.client,
    attempted: discovery.attempted
  };
}

async function optionalMagicDnsSuffix(process: TailscaleStatusProcess | undefined): Promise<string | undefined> {
  if (!process) return undefined;
  try {
    return await readTailscaleMagicDnsSuffix(process);
  } catch {
    return undefined;
  }
}

function isUnavailableCandidate(error: unknown): boolean {
  if (error instanceof HubUnavailableError || error instanceof HubTimeoutError || error instanceof TypeError) return true;
  return error instanceof HubHttpError && [404, 408, 425, 429, 502, 503, 504].includes(error.status);
}
