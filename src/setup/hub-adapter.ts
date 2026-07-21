import {
  createBrainApi,
  createHubHttpClient,
  createRegistryRemotePort,
  drainPendingHubMutations,
  HubUnavailableError,
  openHubSession,
  previewHubSession,
  reconcileHubReleases,
  trustHubSession,
  type ConnectedHubSession,
  type HubClientFactory,
  type LocalStableReleaseApplyPort,
  type TailscaleStatusProcess
} from "../hub/client/index.js";
import { readHubTrust } from "../hub/config/index.js";
import { ensureConfig } from "../config/service.js";
import { UsageError } from "../domain/errors.js";
import { canonicalSigningKeyFingerprint } from "../hub/protocol/index.js";
import { verifyHubTrust } from "../hub/client/index.js";
import type { HubReconcileRequest, HubSetupDiscovery, HubSetupPort } from "./types.js";
const setupHubUnavailableMessage = "Skillloom Hub became unavailable during setup registry reconcile; fix Hub connectivity and rerun setup, or rerun with --hub local for explicit local-only setup";

export class HubSetupAdapter implements HubSetupPort {
  private readonly previews = new Map<string, ConnectedHubSession>();

  constructor(
    private readonly clientVersion: string,
    private readonly tailscale: TailscaleStatusProcess,
    private readonly createClient: HubClientFactory = (baseUrl) => createHubHttpClient({ baseUrl }),
    private readonly stableApply?: LocalStableReleaseApplyPort
  ) {}

  async discover(root: string): Promise<HubSetupDiscovery> {
    let preview: ConnectedHubSession;
    try {
      preview = await previewHubSession({
        root,
        clientVersion: this.clientVersion,
        createClient: this.createClient,
        tailscaleStatus: this.tailscale
      });
    } catch (error) {
      if (error instanceof HubUnavailableError) return { mode: "local-only" };
      throw error;
    }
    const existingTrust = await readHubTrust(root);
    if (existingTrust) verifyHubTrust(existingTrust, preview.negotiation);
    this.previews.set(root, preview);
    return {
      mode: "connected",
      endpoint: preview.endpoint.url,
      hubInstanceId: preview.negotiation.hubInstanceId,
      signingKeyFingerprint: canonicalSigningKeyFingerprint(preview.negotiation.releaseSigningPublicKey)
    };
  }

  async trust(root: string, discovery: Extract<HubSetupDiscovery, { mode: "connected" }>): Promise<{ trusted: true }> {
    const preview = this.previews.get(root);
    if (!preview || preview.endpoint.url !== discovery.endpoint
      || preview.negotiation.hubInstanceId !== discovery.hubInstanceId
      || canonicalSigningKeyFingerprint(preview.negotiation.releaseSigningPublicKey) !== discovery.signingKeyFingerprint) {
      throw new Error("Hub trust preview is missing or changed; run setup again");
    }
    await trustHubSession(root, preview, { explicit: true, trustedAt: new Date().toISOString() });
    this.previews.delete(root);
    return { trusted: true };
  }

  async verifyBrainRead(root: string): Promise<{ verified: true }> {
    const session = await this.openSession(root);
    if (session.mode === "local-only") throw new Error("Skillloom Hub is offline");
    await createBrainApi(root, session.client).search({ query: "skillloom-setup-read-probe", limit: 1 });
    return { verified: true };
  }

  async reconcile({ root, apply, strictInitial }: HubReconcileRequest) {
    const session = await this.openSession(root);
    if (session.mode === "local-only") {
      if (strictInitial) throw new UsageError(setupHubUnavailableMessage);
      return { applied: false, pulled: 0, imported: 0, conflicts: ["Hub is offline"] };
    }
    if (apply) await drainPendingHubMutations(root, session.client);
    const [trust, config] = await Promise.all([readHubTrust(root), ensureConfig(root)]);
    const reconciled = await reconcileHubReleases({
      root,
      remote: createRegistryRemotePort(session.client),
      trust,
      hub: {
        hubInstanceId: session.negotiation.hubInstanceId,
        releaseSigningPublicKey: session.negotiation.releaseSigningPublicKey
      },
      allowedCapabilities: config.policy.allowedCapabilities ?? [],
      ...(apply && this.stableApply ? { apply: this.stableApply } : {})
    });
    if (strictInitial && reconciled.mode === "offline") throw new UsageError(setupHubUnavailableMessage);
    return {
      applied: apply,
      pulled: reconciled.imported,
      imported: reconciled.imported,
      conflicts: reconciled.mode === "offline" ? ["Hub is offline"] : []
    };
  }

  private async openSession(root: string) {
    return await openHubSession({
      root,
      clientVersion: this.clientVersion,
      createClient: this.createClient,
      tailscaleStatus: this.tailscale
    });
  }
}

export async function openDefaultHubSession(
  root: string,
  clientVersion: string,
  tailscale: TailscaleStatusProcess
): Promise<ConnectedHubSession> {
  const session = await openSession(root, clientVersion, tailscale);
  if (session.mode === "local-only") throw new Error("Skillloom Hub is offline");
  return session;
}

async function openSession(root: string, clientVersion: string, tailscale: TailscaleStatusProcess) {
  return await openHubSession({
    root,
    clientVersion,
    createClient: (baseUrl) => createHubHttpClient({ baseUrl }),
    tailscaleStatus: tailscale
  });
}
