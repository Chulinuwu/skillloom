import type { SkillCapability } from "../../domain/types.js";
import { readHubSyncState, writeHubSyncState } from "../config/index.js";
import type { HubTrustAnchor } from "../config/index.js";
import type {
  ChannelManifest,
  PackageBlobV1,
  RegistryRelease,
  SignedRegistryPayload
} from "../registry/index.js";
import { HubResponseValidationError, HubUnavailableError } from "./errors.js";
import { materializeHubReleaseCandidate } from "./release-materialize.js";
import type { HubReleaseCandidateReference, VerifiedHubRelease } from "./release-types.js";
import { verifyHubReleaseBundle } from "./release-verify.js";
import type { HubTrustMaterial } from "./trust.js";

export interface RegistryRemotePort {
  readStableManifest(afterSequence: string): Promise<SignedRegistryPayload<ChannelManifest> | null>;
  readRelease(releaseId: string): Promise<SignedRegistryPayload<RegistryRelease>>;
  readBlob(packageHash: string): Promise<PackageBlobV1>;
}

export type StableReleaseApplyInput = Readonly<{
  root: string;
  release: VerifiedHubRelease;
  candidate: HubReleaseCandidateReference;
}>;

export interface LocalStableReleaseApplyPort {
  applyStableRelease(input: StableReleaseApplyInput): Promise<void>;
}

export type ReconcileHubReleasesOptions = Readonly<{
  root: string;
  remote: RegistryRemotePort;
  trust: HubTrustAnchor | null;
  hub: HubTrustMaterial;
  allowedCapabilities: readonly SkillCapability[];
  apply?: LocalStableReleaseApplyPort;
}>;

export type HubReconcileResult =
  | Readonly<{ mode: "offline"; sequence: string; imported: 0; applied: 0 }>
  | Readonly<{ mode: "up-to-date"; sequence: string; imported: 0; applied: 0 }>
  | Readonly<{ mode: "reconciled"; sequence: string; imported: number; applied: number }>;

export async function reconcileHubReleases(options: ReconcileHubReleasesOptions): Promise<HubReconcileResult> {
  const checkpoint = await readHubSyncState(options.root);
  let manifest: SignedRegistryPayload<ChannelManifest> | null;
  let artifacts: Array<{ release: SignedRegistryPayload<RegistryRelease>; blob: PackageBlobV1 }>;
  try {
    manifest = await options.remote.readStableManifest(checkpoint.lastEventSequence);
    if (!manifest) {
      return { mode: "up-to-date", sequence: checkpoint.lastEventSequence, imported: 0, applied: 0 };
    }
    artifacts = [];
    for (const reference of manifest.payload.releases) {
      const release = await options.remote.readRelease(reference.releaseId);
      const blob = await options.remote.readBlob(reference.packageHash);
      artifacts.push({ release, blob });
    }
  } catch (error) {
    if (error instanceof HubUnavailableError) {
      return { mode: "offline", sequence: checkpoint.lastEventSequence, imported: 0, applied: 0 };
    }
    throw error;
  }
  const verified = await verifyHubReleaseBundle({
    trust: options.trust,
    hub: options.hub,
    afterSequence: checkpoint.lastEventSequence,
    allowedCapabilities: options.allowedCapabilities,
    manifest,
    artifacts
  });
  if (verified.manifest.channel !== "stable") {
    throw new HubResponseValidationError("Reconciliation accepts only the stable release channel");
  }
  let imported = 0;
  let applied = 0;
  for (const release of verified.releases) {
    const candidate = await materializeHubReleaseCandidate(options.root, release);
    imported += 1;
    if (options.apply) {
      await options.apply.applyStableRelease({ root: options.root, release, candidate });
      applied += 1;
    }
  }
  await writeHubSyncState(options.root, { version: 1, lastEventSequence: verified.sequence });
  return { mode: "reconciled", sequence: verified.sequence, imported, applied };
}
