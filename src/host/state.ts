import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../files/atomic-write.js";

export type HostPaths = ReturnType<typeof hostPaths>;

export async function prepareHostState(hostRoot: string, packageRoot: string): Promise<HostPaths> {
  const paths = hostPaths(hostRoot);
  await Promise.all([
    secureDirectory(hostRoot),
    secureDirectory(paths.data),
    secureDirectory(paths.tailscaleState),
    secureDirectory(paths.obsidianConfig)
  ]);
  await atomicWriteFile(paths.envFile, hostEnvironment(paths), { mode: 0o600 });
  try {
    await copyFile(join(packageRoot, "hub", "policy.example.hujson"), paths.policy, constants.COPYFILE_EXCL);
    await chmod(paths.policy, 0o600);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }
  return paths;
}

export async function requiresTailscaleAuth(paths: HostPaths): Promise<boolean> {
  return (await readdir(paths.tailscaleState)).length === 0;
}

export async function hostStateExists(hostRoot: string): Promise<boolean> {
  try {
    await access(hostPaths(hostRoot).envFile);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export function hostPaths(hostRoot: string) {
  return {
    root: hostRoot,
    data: join(hostRoot, "data"),
    tailscaleState: join(hostRoot, "tailscale-state"),
    obsidianConfig: join(hostRoot, "obsidian-config"),
    envFile: join(hostRoot, "host.env"),
    policy: join(hostRoot, "policy.hujson")
  };
}

function hostEnvironment(paths: ReturnType<typeof hostPaths>): string {
  return [
    `SKILLLOOM_HUB_DATA_DIR=${quote(paths.data)}`,
    `SKILLLOOM_TAILSCALE_STATE_DIR=${quote(paths.tailscaleState)}`,
    `SKILLLOOM_OBSIDIAN_CONFIG_DIR=${quote(paths.obsidianConfig)}`,
    ""
  ].join("\n");
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function secureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
