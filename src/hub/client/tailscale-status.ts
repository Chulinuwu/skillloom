import { HubDiscoveryConfigurationError } from "./errors.js";

export type TailscaleStatusProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export interface TailscaleStatusProcess {
  run(executable: "tailscale", args: readonly ["status", "--json"]): Promise<TailscaleStatusProcessResult>;
}

export async function readTailscaleMagicDnsSuffix(process: TailscaleStatusProcess): Promise<string> {
  const result = await process.run("tailscale", ["status", "--json"]);
  if (result.exitCode !== 0) {
    throw new HubDiscoveryConfigurationError("tailscale status --json failed");
  }
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch (error) {
    throw new HubDiscoveryConfigurationError("tailscale status did not return JSON", { cause: error });
  }
  if (!isRecord(value) || typeof value.MagicDNSSuffix !== "string") {
    throw new HubDiscoveryConfigurationError("tailscale status is missing MagicDNSSuffix");
  }
  const suffix = value.MagicDNSSuffix.trim().replace(/\.$/, "").toLowerCase();
  if (suffix.length === 0) throw new HubDiscoveryConfigurationError("tailscale status has an empty MagicDNSSuffix");
  return suffix;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
