import { HubHttpError } from "./errors.js";
import type { RegistryRemotePort } from "./reconciler.js";
import {
  parseRegistryBlobEnvelope,
  parseRegistryManifestEnvelope,
  parseRegistryReleaseEnvelope
} from "./registry-remote-schema.js";
import type { HubHttpClient } from "./transport-types.js";

export function createRegistryRemotePort(client: HubHttpClient): RegistryRemotePort {
  return {
    readStableManifest: async (afterSequence) => {
      try {
        return await client.request({
          method: "GET",
          path: `/v1/registry/channels/stable?afterSequence=${encodeURIComponent(afterSequence)}`,
          parse: parseRegistryManifestEnvelope
        });
      } catch (error) {
        if (error instanceof HubHttpError && error.status === 404) return null;
        throw error;
      }
    },
    readRelease: async (releaseId) => await client.request({
      method: "GET",
      path: `/v1/registry/releases/${encodeURIComponent(releaseId)}`,
      parse: parseRegistryReleaseEnvelope
    }),
    readBlob: async (packageHash) => await client.request({
      method: "GET",
      path: `/v1/registry/blobs/${encodeURIComponent(packageHash)}`,
      parse: parseRegistryBlobEnvelope
    })
  };
}
