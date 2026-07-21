import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../../files/atomic-write.js";
import { canonicalizeJson } from "./canonical-json.js";
import { RegistryStorageCorruptionError } from "./server-errors.js";
import { registryLayout } from "./registry-layout.js";
import {
  parseCandidateRecord,
  parseRegistryIdempotencyRecord,
  parseSignedManifest,
  parseSignedRelease
} from "./server-schema.js";
import type {
  RegistryCandidateRecord,
  RegistryIdempotencyRecord
} from "./server-types.js";
import { hashPackageBlob, parsePackageBlob } from "./package-blob.js";
import type { ChannelManifest, PackageBlobV1, RegistryRelease, SignedRegistryPayload } from "./types.js";

export class FileRegistryStore {
  private readonly layout;

  constructor(root: string) {
    this.layout = registryLayout(root);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.layout.blobs, { recursive: true }),
      mkdir(this.layout.candidates, { recursive: true }),
      mkdir(this.layout.releases, { recursive: true }),
      mkdir(this.layout.channels, { recursive: true }),
      mkdir(this.layout.idempotency, { recursive: true })
    ]);
    await this.assertReferencesComplete();
  }

  async writeBlob(hash: string, blob: PackageBlobV1): Promise<void> {
    const parsed = parsePackageBlob(blob);
    if (await hashPackageBlob(parsed) !== hash) throw new RegistryStorageCorruptionError(`Blob content does not match ${hash}`);
    await this.writeImmutable(this.layout.blob(hash), parsed);
  }

  async readBlob(hash: string): Promise<PackageBlobV1 | null> {
    const value = await this.readJson(this.layout.blob(hash));
    if (value === null) return null;
    const blob = parsePackageBlob(value);
    if (await hashPackageBlob(blob) !== hash) throw new RegistryStorageCorruptionError(`Blob content does not match ${hash}`);
    return blob;
  }

  async writeCandidate(record: RegistryCandidateRecord): Promise<void> {
    await this.writeImmutable(this.layout.candidate(record.candidate.payload.candidateId), record);
  }

  async readCandidate(candidateId: string): Promise<RegistryCandidateRecord | null> {
    const value = await this.readJson(this.layout.candidate(candidateId));
    return value === null ? null : parseCandidateRecord(value);
  }

  async writeRelease(release: SignedRegistryPayload<RegistryRelease>): Promise<void> {
    if (!await this.readBlob(release.payload.packageHash)) {
      throw new RegistryStorageCorruptionError(`Release ${release.payload.releaseId} points to a missing blob`);
    }
    await this.writeImmutable(this.layout.release(release.payload.releaseId), release);
  }

  async readRelease(releaseId: string): Promise<SignedRegistryPayload<RegistryRelease> | null> {
    const value = await this.readJson(this.layout.release(releaseId));
    return value === null ? null : parseSignedRelease(value);
  }

  async writeManifest(manifest: SignedRegistryPayload<ChannelManifest>): Promise<void> {
    await this.assertManifestReferences(manifest);
    await atomicWriteFile(this.layout.channel(manifest.payload.channel), canonicalizeJson(manifest), { mode: 0o600 });
  }

  async readManifest(channel: string): Promise<SignedRegistryPayload<ChannelManifest> | null> {
    const value = await this.readJson(this.layout.channel(channel));
    return value === null ? null : parseSignedManifest(value);
  }

  async readIdempotency(actorId: string, requestId: string): Promise<RegistryIdempotencyRecord | null> {
    const value = await this.readJson(this.layout.idempotencyRecord(actorId, requestId));
    return value === null ? null : parseRegistryIdempotencyRecord(value);
  }

  async writeIdempotency(record: RegistryIdempotencyRecord): Promise<void> {
    const path = this.layout.idempotencyRecord(record.actorId, record.requestId);
    await mkdir(dirname(path), { recursive: true });
    await this.writeImmutable(path, record);
  }

  async nextSequence(): Promise<string> {
    let maximum = 0n;
    for (const directory of [this.layout.candidates, this.layout.releases, this.layout.channels]) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const value = await this.readJson(join(directory, entry.name));
        const sequence = readEnvelopeSequence(value);
        if (BigInt(sequence) > maximum) maximum = BigInt(sequence);
      }
    }
    return (maximum + 1n).toString();
  }

  async assertReferencesComplete(): Promise<void> {
    for (const entry of await readdir(this.layout.channels, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const value = await this.readJson(join(this.layout.channels, entry.name));
      if (value === null) continue;
      await this.assertManifestReferences(parseSignedManifest(value));
    }
  }

  private async assertManifestReferences(manifest: SignedRegistryPayload<ChannelManifest>): Promise<void> {
    for (const item of manifest.payload.releases) {
      const release = await this.readRelease(item.releaseId);
      if (!release || release.payload.packageHash !== item.packageHash || !await this.readBlob(item.packageHash)) {
        throw new RegistryStorageCorruptionError(`Manifest ${manifest.payload.channel} contains an orphan release reference ${item.releaseId}`);
      }
    }
  }

  private async writeImmutable(path: string, value: unknown): Promise<void> {
    const serialized = canonicalizeJson(value);
    const existing = await this.readText(path);
    if (existing !== null) {
      if (existing !== serialized) throw new RegistryStorageCorruptionError(`Immutable registry object conflicts at ${path}`);
      return;
    }
    await atomicWriteFile(path, serialized, { mode: 0o600 });
  }

  private async readJson(path: string): Promise<unknown | null> {
    const text = await this.readText(path);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new RegistryStorageCorruptionError(`Registry JSON is corrupt at ${path}`);
    }
  }

  private async readText(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
  }

}

function readEnvelopeSequence(value: unknown): string {
  if (!isRecord(value)) {
    throw new RegistryStorageCorruptionError("Stored registry envelope has an invalid sequence");
  }
  const envelope = isRecord(value.candidate) ? value.candidate : value;
  if (!isRecord(envelope.payload) || typeof envelope.payload.sequence !== "string" || !/^(0|[1-9]\d*)$/.test(envelope.payload.sequence)) {
    throw new RegistryStorageCorruptionError("Stored registry envelope has an invalid sequence");
  }
  return envelope.payload.sequence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
