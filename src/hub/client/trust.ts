import { canonicalSigningKeyFingerprint } from "../protocol/signing-key.js";
import type { HubTrustAnchor } from "../config/types.js";
import { HubTrustChangedError, HubTrustNotEstablishedError } from "./errors.js";

export type HubTrustMaterial = {
  hubInstanceId: string;
  releaseSigningPublicKey: string;
};

export type ExplicitHubTrustConsent = {
  explicit: true;
  trustedAt: string;
};

export function establishHubTrust(material: HubTrustMaterial, consent: ExplicitHubTrustConsent): HubTrustAnchor {
  if (consent.explicit !== true || Number.isNaN(Date.parse(consent.trustedAt))) {
    throw new HubTrustNotEstablishedError();
  }
  return {
    version: 1,
    hubInstanceId: material.hubInstanceId,
    signingKeyFingerprint: canonicalSigningKeyFingerprint(material.releaseSigningPublicKey),
    trustedAt: consent.trustedAt
  };
}

export function verifyHubTrust(trust: HubTrustAnchor | null, material: HubTrustMaterial): HubTrustAnchor {
  if (!trust) throw new HubTrustNotEstablishedError();
  if (trust.hubInstanceId !== material.hubInstanceId) throw new HubTrustChangedError("hubInstanceId");
  if (trust.signingKeyFingerprint !== canonicalSigningKeyFingerprint(material.releaseSigningPublicKey)) {
    throw new HubTrustChangedError("signingKeyFingerprint");
  }
  return trust;
}
