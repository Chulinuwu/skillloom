import type { ConsentPort, ProcessPort } from "../setup/types.js";

export type HostSurfaces = {
  hub: { url: string; externalPort: 443; internalPort: 8787; access: "read-write" };
  obsidian: {
    url: string;
    externalPort: 8443;
    internalPort: 3000;
    workspaces: {
      library: { path: "Library"; access: "read-only" };
      dashboards: { path: "Bases"; access: "writable-ui-state" };
      authoring: { path: "Authoring"; access: "writable-staging" };
    };
  };
};
export type HostResult = {
  command: "host";
  action: "install" | "status";
  status: "running" | "degraded" | "stopped";
  root: string;
  policyPath: string;
  surfaces: HostSurfaces | null;
  nextActions: string[];
};
export type HostServiceOptions = {
  packageRoot: string;
  hostRoot: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};
export type HostServiceDependencies = {
  processes: ProcessPort;
  consent: ConsentPort;
  localBackendsHealthy?: () => Promise<boolean>;
  wait?: (milliseconds: number) => Promise<void>;
};
export type DockerReadinessOptions = {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  wait?: (milliseconds: number) => Promise<void>;
};
