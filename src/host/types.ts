import type { ConsentPort, ProcessPort } from "../setup/types.js";

export type HostSurface = { url: string; externalPort: 443; internalPort: number; access: "read-write" | "read-only" };
export type HostResult = {
  command: "host";
  action: "install" | "status";
  status: "running" | "stopped";
  root: string;
  policyPath: string;
  surfaces: { hub: HostSurface; obsidian: HostSurface } | null;
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
