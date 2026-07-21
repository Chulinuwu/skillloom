import type { ChannelManifest, SignedRegistryPayload } from "../registry/index.js";
import { HubResponseValidationError, HubStableReleaseNotFoundError } from "./errors.js";
import type {
  RegistryReadApi,
  RegistryReadApiOptions,
  StableSkillFile,
  StableSkillReleaseDetails,
  StableSkillReleaseMetadata,
  StableSkillReleaseSummary
} from "./registry-read-types.js";
import type { VerifiedHubRelease } from "./release-types.js";
import { verifyHubStableManifest, verifyHubStableRelease } from "./release-verify.js";
import { verifyHubTrust } from "./trust.js";

const maximumStableReleases = 256;

type VerifiedStableManifest = Readonly<{
  envelope: SignedRegistryPayload<ChannelManifest>;
  manifest: ChannelManifest;
}>;

export function createRegistryReadApi(options: RegistryReadApiOptions): RegistryReadApi {
  return {
    listStableReleases: async (limit = 50) => {
      requireLimit(limit);
      const verified = await readStableManifest(options);
      const releases = verified === null
        ? []
        : [...verified.manifest.releases]
          .sort((left, right) => compareSequenceDescending(left.releaseSequence, right.releaseSequence))
          .slice(0, limit)
          .map((release) => manifestReleaseSummary(release));
      return {
        channels: [{
          channel: "stable",
          sequence: verified?.manifest.sequence ?? "0",
          releases: Object.freeze(releases)
        }]
      };
    },
    readStableRelease: async (releaseId) => {
      requireReleaseId(releaseId);
      const stable = await readStableManifest(options);
      const entry = stable?.manifest.releases.find((release) => release.releaseId === releaseId);
      if (!entry || !stable) throw new HubStableReleaseNotFoundError(releaseId);
      const release = await options.remote.readRelease(entry.releaseId);
      const blob = await options.remote.readBlob(entry.packageHash);
      const verified = await verifyHubStableRelease({
        trust: options.trust,
        hub: options.hub,
        manifest: stable.envelope,
        artifact: { release, blob }
      });
      return releaseDetails(verified);
    }
  };
}

async function readStableManifest(options: RegistryReadApiOptions): Promise<VerifiedStableManifest | null> {
  verifyHubTrust(options.trust, options.hub);
  const envelope = await options.remote.readStableManifest("0");
  if (envelope === null) return null;
  if (envelope.payload.releases.length > maximumStableReleases) {
    throw new HubResponseValidationError(`Stable manifest exceeds ${maximumStableReleases} readable releases`);
  }
  const manifest = verifyHubStableManifest({
    trust: options.trust,
    hub: options.hub,
    manifest: envelope
  });
  if (manifest.releases.length > maximumStableReleases) {
    throw new HubResponseValidationError(`Stable manifest exceeds ${maximumStableReleases} readable releases`);
  }
  return Object.freeze({ envelope, manifest });
}

function releaseDetails(verified: VerifiedHubRelease): StableSkillReleaseDetails {
  const release = verified.release;
  return {
    release: releaseMetadata(release),
    evidence: {
      validationDigest: release.validationDigest,
      provenance: Object.freeze([...release.provenance]),
      supersedesReleaseHash: release.supersedesReleaseHash
    },
    files: Object.freeze(verified.blob.files.map((file) => safeTextFile(file)))
  };
}

function manifestReleaseSummary(release: ChannelManifest["releases"][number]): StableSkillReleaseSummary {
  return {
    releaseId: release.releaseId,
    name: release.name,
    version: release.version,
    channel: "stable",
    sequence: release.releaseSequence,
    packageHash: release.packageHash
  };
}

function releaseMetadata(release: VerifiedHubRelease["release"]): StableSkillReleaseMetadata {
  return {
    releaseId: release.releaseId,
    name: release.name,
    version: release.version,
    channel: "stable",
    sequence: release.sequence,
    packageHash: release.packageHash,
    capabilities: Object.freeze([...release.capabilities]),
    createdAt: release.createdAt,
    createdBy: release.createdBy
  };
}

function safeTextFile(file: VerifiedHubRelease["blob"]["files"][number]): StableSkillFile {
  const content = Buffer.from(file.contentBase64, "base64");
  return {
    relativePath: file.relativePath,
    mode: file.mode,
    content: new TextDecoder("utf-8", { fatal: true }).decode(content)
  };
}

function requireLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HubResponseValidationError("Stable release limit must be an integer from 1 to 100");
  }
}

function requireReleaseId(releaseId: string): void {
  if (releaseId.length === 0 || releaseId.length > 200 || releaseId !== releaseId.trim() || releaseId.includes("\0")) {
    throw new HubResponseValidationError("Stable releaseId must be canonical text of at most 200 characters");
  }
}

function compareSequenceDescending(left: string, right: string): number {
  const leftSequence = BigInt(left);
  const rightSequence = BigInt(right);
  return leftSequence === rightSequence ? 0 : leftSequence > rightSequence ? -1 : 1;
}
