import { access, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../files/atomic-write.js";
import { prepareObsidianProfile } from "./obsidian-profile.js";
import { prepareObsidianWorkspace } from "./obsidian-workspace.js";
export type HostPaths = ReturnType<typeof hostPaths>;
export async function prepareHostState(hostRoot: string, policyFragment: string): Promise<HostPaths> {
  const paths = hostPaths(hostRoot);
  await Promise.all([
    secureDirectory(hostRoot),
    secureDirectory(paths.data),
    secureDirectory(paths.obsidianConfig),
    secureDirectory(paths.obsidianVaultConfig),
    secureDirectory(paths.obsidianProjectionRoot),
    secureDirectory(paths.obsidianVaultConfigMountpoint),
    secureDirectory(paths.obsidianBasesMountpoint),
    secureDirectory(paths.obsidianAuthoringMountpoint),
    secureDirectory(paths.obsidianBases),
    secureDirectory(paths.obsidianAuthoring)
  ]);
  await prepareObsidianProfile(paths.obsidianConfig);
  await prepareObsidianWorkspace(paths.obsidianVaultConfig);
  await atomicWriteFile(paths.envFile, hostEnvironment(paths), { mode: 0o600 });
  await atomicWriteFile(paths.policy, policyFragment, { mode: 0o600 });
  return paths;
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
    obsidianConfig: join(hostRoot, "obsidian-config"),
    obsidianVaultConfig: join(hostRoot, "obsidian-config", "vault-config"),
    obsidianProjectionRoot: join(hostRoot, "data", "brain", "projections", "obsidian-vault"),
    obsidianVaultConfigMountpoint: join(hostRoot, "data", "brain", "projections", "obsidian-vault", ".obsidian"),
    obsidianBasesMountpoint: join(hostRoot, "data", "brain", "projections", "obsidian-vault", "Bases"),
    obsidianAuthoringMountpoint: join(hostRoot, "data", "brain", "projections", "obsidian-vault", "Authoring"),
    obsidianBases: join(hostRoot, "data", "brain", "obsidian-ui", "Bases"),
    obsidianAuthoring: join(hostRoot, "data", "brain", "authoring"),
    envFile: join(hostRoot, "host.env"),
    policy: join(hostRoot, "policy.hujson")
  };
}
function hostEnvironment(paths: ReturnType<typeof hostPaths>): string {
  return [
    `SKILLLOOM_HUB_DATA_DIR=${quote(paths.data)}`,
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
function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
