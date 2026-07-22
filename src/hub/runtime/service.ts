import { createBrainService, createObsidianAuthoringSync, FileObsidianProjectionManager, type BrainDerivedProjectionPort } from "../brain/index.js";
import { createBrainHttpRouter, createBrainHttpServer, listenBrainHttpServer } from "../http/index.js";
import { createRegistryHttpRouter, createRegistryService } from "../registry/index.js";
import { loadHubRuntimeConfig, type HubRuntimeConfig } from "./config.js";
import { createAuthoringSyncLoop, type AuthoringSyncPort } from "./authoring-loop.js";
import { createHubRuntimeRequestListener } from "./listener.js";
import { OBSIDIAN_AUTHORING_ACTOR_ID, createRuntimeBrainPermissions, createRuntimeRegistryPermissions } from "./permissions.js";
import { createHubRuntimeRouter } from "./router.js";
import { loadHubRuntimeState } from "./state.js";

export type HubRuntime = Readonly<{
  config: HubRuntimeConfig;
  hubInstanceId: string;
  signingPublicKey: string;
  start(): Promise<void>;
  close(): Promise<void>;
}>;

export async function createHubRuntime(env: NodeJS.ProcessEnv = process.env, dependencies: {
  projection?: BrainDerivedProjectionPort;
  authoringSync?: AuthoringSyncPort;
  onAuthoringError?: (error: unknown) => void;
} = {}): Promise<HubRuntime> {
  const config = loadHubRuntimeConfig(env);
  const state = await loadHubRuntimeState(config.dataDir);
  const brain = await createBrainService({
    root: state.paths.brainRoot,
    permissions: createRuntimeBrainPermissions(),
    projection: dependencies.projection ?? new FileObsidianProjectionManager(state.paths.brainRoot)
  });
  const registry = await createRegistryService({
    root: state.paths.registryRoot,
    hubInstanceId: state.hubInstanceId,
    signer: state.signer,
    permissions: createRuntimeRegistryPermissions()
  });
  const authoring = config.obsidianAuthoringEnabled
    ? dependencies.authoringSync ?? createObsidianAuthoringSync({
        root: state.paths.brainRoot,
        brain,
        actor: { actorId: OBSIDIAN_AUTHORING_ACTOR_ID }
      })
    : undefined;
  const authoringLoop = authoring === undefined
    ? undefined
    : createAuthoringSyncLoop(authoring, config.obsidianAuthoringIntervalMs, dependencies.onAuthoringError);
  let ready = true;
  const router = createHubRuntimeRouter(createBrainHttpRouter(brain), createRegistryHttpRouter(registry), {
    hubInstanceId: state.hubInstanceId,
    releaseSigningPublicKey: state.signer.publicKey,
    latestEventSequence: async () => await brain.latestEventSequence(),
    ready: () => ready
  });
  const listener = createHubRuntimeRequestListener({
    async handle(request, authorization) {
      return await router.handle(request, authorization);
    }
  }, config, () => ready);
  const server = createBrainHttpServer(listener);
  let closePromise: Promise<void> | undefined;
  return {
    config,
    hubInstanceId: state.hubInstanceId,
    signingPublicKey: state.signer.publicKey,
    async start(): Promise<void> {
      await listenBrainHttpServer(server, { host: config.bindHost, port: config.port });
      authoringLoop?.start();
    },
    async close(): Promise<void> {
      if (closePromise !== undefined) {
        await closePromise;
        return;
      }
      ready = false;
      closePromise = (async () => {
        await authoringLoop?.close();
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
          });
        }
        await brain.close();
      })();
      await closePromise;
    }
  };
}
