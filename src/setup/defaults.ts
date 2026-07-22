import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createBrainApi,
  createHubHttpClient,
  createRegistryMutationApi,
  createRegistryReadApi,
  createRegistryRemotePort
} from "../hub/client/index.js";
import { readHubTrust } from "../hub/config/index.js";
import type { Scope } from "../domain/types.js";
import type { BridgeStdioOptions } from "../bridge/index.js";
import { HostService } from "../host/service.js";
import { LazyHubApiBridgeAdapter } from "./bridge-remote.js";
import { TerminalConsentPort } from "./consent.js";
import { SetupEnvironmentDetector } from "./environment.js";
import { DynamicSetupGuidanceSources } from "./guidance-sources.js";
import { HarnessInstaller } from "./harness-installer.js";
import { HubSetupAdapter, openDefaultHubSession } from "./hub-adapter.js";
import { resolvePackageRoot } from "./package-root.js";
import { PortableSkillInstaller } from "./portable-skills.js";
import { SystemProcessPort } from "./process.js";
import { SetupService } from "./service.js";
import { SetupRolePlanner } from "./role-plan.js";
import { TailscaleProcessAdapter } from "./tailscale-process.js";
import { StableReleaseInstaller } from "./stable-apply.js";

export async function createDefaultSetupService(scope: Scope): Promise<SetupService> {
  const root = scope === "user" ? homedir() : process.cwd();
  return await createSetupService(root, scope);
}

export async function createDefaultSyncService(): Promise<SetupService> {
  const root = await resolveTrustedRoot();
  return await createSetupService(root, root === homedir() ? "user" : "project");
}

async function createSetupService(root: string, scope: Scope): Promise<SetupService> {
  const packageRoot = resolvePackageRoot();
  const packageVersion = await readPackageVersion(packageRoot);
  const processes = new SystemProcessPort();
  const guidanceSources = new DynamicSetupGuidanceSources(processes);
  return new SetupService(
    new HubSetupAdapter(
      packageVersion,
      new TailscaleProcessAdapter(processes),
      (baseUrl) => createHubHttpClient({ baseUrl }),
      new StableReleaseInstaller(scope)
    ),
    new HarnessInstaller(processes, new PortableSkillInstaller()),
    new TerminalConsentPort(),
    { root, stateRoot: join(root, ".skillloom", "hub"), packageRoot, packageVersion },
    new SetupEnvironmentDetector(processes),
    new SetupRolePlanner(guidanceSources),
    new HostService(
      { processes, consent: new TerminalConsentPort() },
      { packageRoot, hostRoot: join(root, ".skillloom", "host"), env: process.env }
    )
  );
}

export async function createDefaultBridgeOptions(): Promise<BridgeStdioOptions> {
  const packageVersion = await readPackageVersion(resolvePackageRoot());
  const root = await resolveTrustedRoot();
  const tailscale = new TailscaleProcessAdapter(new SystemProcessPort());
  const setup = await createSetupService(root, root === homedir() ? "user" : "project");
  return {
    remote: new LazyHubApiBridgeAdapter(async () => {
      const session = await openDefaultHubSession(root, packageVersion, tailscale);
      const trust = await readHubTrust(root);
      return {
        brain: createBrainApi(root, session.client),
        registry: {
          ...createRegistryMutationApi(root, session.client),
          ...createRegistryReadApi({
            remote: createRegistryRemotePort(session.client),
            trust,
            hub: {
              hubInstanceId: session.negotiation.hubInstanceId,
              releaseSigningPublicKey: session.negotiation.releaseSigningPublicKey
            }
          })
        }
      };
    }),
    sync: {
      async syncOnce(signal) {
        if (signal.aborted) throw signal.reason;
        await setup.sync(true);
      }
    }
  };
}

export async function resolveTrustedRoot(): Promise<string> {
  const projectRoot = process.cwd();
  if (await readHubTrust(projectRoot)) return projectRoot;
  const userRoot = homedir();
  if (await readHubTrust(userRoot)) return userRoot;
  return userRoot;
}

async function readPackageVersion(packageRoot: string): Promise<string> {
  const value: unknown = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (typeof value !== "object" || value === null || !("version" in value) || typeof value.version !== "string") {
    throw new Error("Skillloom package version is missing");
  }
  return value.version;
}
