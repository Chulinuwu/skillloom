import type { ConsentPort, ProcessPort } from "../setup/types.js";

export type HostSurfaces = {
  hub: { url: string; externalPort: 443; internalPort: 8787; access: "read-write" };
  obsidian: {
    url: string;
    externalPort: 8443;
    internalPort: 3000;
    workspaces: {
      library: { path: "Library"; access: "read-only" };
      authoring: { path: "Authoring"; access: "writable-staging" };
    };
  };
};
export type HostResult = {
  command: "host";
  action: "install" | "status";
  status: "running" | "stopped";
  root: string;
  policyPath: string;
  surfaces: HostSurfaces | null;
  nextActions: string[];
};
export type HostServiceOptions = {
  packageRoot: string;
  hostRoot: string;
  env: NodeJS.ProcessEnv;
};
export type HostServiceDependencies = {
  processes: ProcessPort;
  consent: ConsentPort;
};
