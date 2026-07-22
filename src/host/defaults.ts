import { homedir } from "node:os";
import { join } from "node:path";
import { TerminalConsentPort } from "../setup/consent.js";
import { resolvePackageRoot } from "../setup/package-root.js";
import { SystemProcessPort } from "../setup/process.js";
import { HostService } from "./service.js";

export function createDefaultHostService(): HostService {
  return new HostService(
    { processes: new SystemProcessPort(), consent: new TerminalConsentPort() },
    { packageRoot: resolvePackageRoot(), hostRoot: join(homedir(), ".skillloom", "host"), env: process.env }
  );
}
