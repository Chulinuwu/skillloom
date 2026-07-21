import { constants } from "node:fs";
import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createEd25519RegistrySigner, type Ed25519RegistrySigner } from "../registry/index.js";

export type HubRuntimeState = Readonly<{
  hubInstanceId: string;
  signer: Ed25519RegistrySigner;
  paths: {
    brainRoot: string;
    registryRoot: string;
  };
}>;

export async function loadHubRuntimeState(dataDir: string): Promise<HubRuntimeState> {
  await secureDirectory(dataDir);
  const runtimeRoot = join(dataDir, "runtime");
  const brainRoot = join(dataDir, "brain");
  const registryRoot = join(dataDir, "registry");
  await Promise.all([secureDirectory(runtimeRoot), secureDirectory(brainRoot), secureDirectory(registryRoot)]);
  const hubInstanceId = await loadCreateOnceFile(join(runtimeRoot, "hub-instance-id"), () => `${randomUUID()}\n`);
  const privateKey = await loadCreateOnceFile(join(runtimeRoot, "registry-signing-key.pem"), generatePrivateKeyPem);
  return {
    hubInstanceId: hubInstanceId.trim(),
    signer: createEd25519RegistrySigner(privateKey),
    paths: { brainRoot, registryRoot }
  };
}

async function secureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function loadCreateOnceFile(path: string, create: () => string): Promise<string> {
  try {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await handle.writeFile(create(), "utf8");
    } finally {
      await handle.close();
    }
    await chmod(path, 0o600);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  await chmod(path, 0o600);
  return await readFile(path, "utf8");
}

function generatePrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
