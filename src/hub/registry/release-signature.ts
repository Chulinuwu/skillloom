import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";
import { canonicalSigningKeyFingerprint } from "../protocol/signing-key.js";
import { canonicalizeJson } from "./canonical-json.js";
import {
  RegistryHubMismatchError,
  RegistrySequenceRollbackError,
  RegistrySignatureVerificationError
} from "./errors.js";
import { isCanonicalRegistrySequence } from "./schema.js";
import type { RegistrySignablePayload, SignedRegistryPayload } from "./types.js";

export interface Ed25519RegistrySigner {
  readonly publicKey: string;
  readonly keyFingerprint: string;
  signCanonical(canonicalPayload: string): string;
}

export interface Ed25519RegistryVerifier {
  readonly publicKey: string;
  readonly keyFingerprint: string;
  verifyCanonical(canonicalPayload: string, signature: string): boolean;
}

export type RegistryVerificationContext = Readonly<{
  hubInstanceId: string;
  afterSequence?: string;
}>;

type KeyInput = KeyObject | string | Buffer;

export function generateEd25519RegistrySigner(): Ed25519RegistrySigner {
  const { privateKey } = generateKeyPairSync("ed25519");
  return createEd25519RegistrySigner(privateKey);
}

export function createEd25519RegistrySigner(input: KeyInput): Ed25519RegistrySigner {
  const privateKey = privateEd25519Key(input);
  const publicKeyObject = createPublicKey(privateKey);
  const publicKey = publicKeyObject.export({ type: "spki", format: "pem" }).toString();
  const keyFingerprint = canonicalSigningKeyFingerprint(publicKey);
  return Object.freeze({
    publicKey,
    keyFingerprint,
    signCanonical(canonicalPayload: string): string {
      return signBytes(null, Buffer.from(canonicalPayload, "utf8"), privateKey).toString("base64url");
    }
  });
}

export function createEd25519RegistryVerifier(input: KeyInput): Ed25519RegistryVerifier {
  const publicKeyObject = publicEd25519Key(input);
  const publicKey = publicKeyObject.export({ type: "spki", format: "pem" }).toString();
  const keyFingerprint = canonicalSigningKeyFingerprint(publicKey);
  return Object.freeze({
    publicKey,
    keyFingerprint,
    verifyCanonical(canonicalPayload: string, signature: string): boolean {
      if (!/^[A-Za-z0-9_-]+$/.test(signature)) return false;
      try {
        return verifyBytes(null, Buffer.from(canonicalPayload, "utf8"), publicKeyObject, Buffer.from(signature, "base64url"));
      } catch {
        return false;
      }
    }
  });
}

export function signRegistryPayload<T extends RegistrySignablePayload>(
  signer: Ed25519RegistrySigner,
  payload: T
): SignedRegistryPayload<T> {
  const signature = Object.freeze({
    algorithm: "Ed25519" as const,
    keyFingerprint: signer.keyFingerprint,
    value: signer.signCanonical(canonicalizeJson(payload))
  });
  return Object.freeze({ payload, signature });
}

export function verifyRegistryPayload<T extends RegistrySignablePayload>(
  verifier: Ed25519RegistryVerifier,
  envelope: SignedRegistryPayload<T>,
  context: RegistryVerificationContext
): T {
  if (envelope.signature.algorithm !== "Ed25519" || envelope.signature.keyFingerprint !== verifier.keyFingerprint) {
    throw new RegistrySignatureVerificationError("Registry signing key does not match the trusted Ed25519 key");
  }
  if (!verifier.verifyCanonical(canonicalizeJson(envelope.payload), envelope.signature.value)) {
    throw new RegistrySignatureVerificationError("Registry signature verification failed");
  }
  if (envelope.payload.hubInstanceId !== context.hubInstanceId) {
    throw new RegistryHubMismatchError(context.hubInstanceId, envelope.payload.hubInstanceId);
  }
  if (!isCanonicalRegistrySequence(envelope.payload.sequence)) {
    throw new RegistrySignatureVerificationError("Signed registry sequence must be a canonical nonnegative decimal sequence");
  }
  if (context.afterSequence !== undefined) {
    if (!/^(0|[1-9]\d*)$/.test(context.afterSequence)) {
      throw new RegistrySignatureVerificationError("afterSequence must be a canonical nonnegative decimal sequence");
    }
    if (BigInt(envelope.payload.sequence) <= BigInt(context.afterSequence)) {
      throw new RegistrySequenceRollbackError(context.afterSequence, envelope.payload.sequence);
    }
  }
  return envelope.payload;
}

function privateEd25519Key(input: KeyInput): KeyObject {
  try {
    const key = input instanceof KeyObject ? input : createPrivateKey(input);
    if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("not an Ed25519 private key");
    return key;
  } catch {
    throw new RegistrySignatureVerificationError("Registry private key must be a native Ed25519 key");
  }
}

function publicEd25519Key(input: KeyInput): KeyObject {
  try {
    const key = input instanceof KeyObject
      ? input.type === "private" ? createPublicKey(input) : input
      : createPublicKey(input);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("not an Ed25519 public key");
    return key;
  } catch {
    throw new RegistrySignatureVerificationError("Registry public key must be a native Ed25519 key");
  }
}
