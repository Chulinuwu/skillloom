import { createHash } from "node:crypto";
import { join } from "node:path";

export function registryLayout(root: string) {
  const registry = join(root, "registry");
  const operations = join(registry, "operations");
  return {
    root: registry,
    blobs: join(registry, "blobs"),
    candidates: join(registry, "candidates"),
    releases: join(registry, "releases"),
    channels: join(registry, "channels"),
    operations,
    pending: join(operations, "pending"),
    idempotency: join(registry, "idempotency"),
    blob(packageHash: string): string {
      return join(registry, "blobs", `${safePackageHash(packageHash)}.json`);
    },
    candidate(candidateId: string): string {
      return join(registry, "candidates", `${safeIdentifier(candidateId)}.json`);
    },
    release(releaseId: string): string {
      return join(registry, "releases", `${safeIdentifier(releaseId)}.json`);
    },
    channel(channel: string): string {
      return join(registry, "channels", `${safeIdentifier(channel)}.json`);
    },
    operation(operationId: string): string {
      return join(operations, "pending", `${safeIdentifier(operationId)}.json`);
    },
    idempotencyRecord(actorId: string, requestId: string): string {
      const actorHash = createHash("sha256").update(actorId).digest("hex");
      return join(registry, "idempotency", actorHash, `${safeIdentifier(requestId)}.json`);
    }
  };
}

function safePackageHash(value: string): string {
  const match = /^sha256-v2:([0-9a-f]{64})$/.exec(value);
  if (!match) throw new TypeError("Invalid sha256-v2 package hash");
  return match[1] as string;
}

function safeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new TypeError("Invalid registry identifier");
  return value;
}
