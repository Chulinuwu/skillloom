import { createHash, createPublicKey } from "node:crypto";
import { HubProtocolValidationError } from "./errors.js";

export function canonicalSigningKeyFingerprint(publicKey: string): string {
  try {
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error("not Ed25519");
    }
    const spki = key.export({ type: "spki", format: "der" });
    return `sha256:${createHash("sha256").update(spki).digest("base64url")}`;
  } catch {
    throw new HubProtocolValidationError("releaseSigningPublicKey must be a valid Ed25519 SPKI public key");
  }
}
