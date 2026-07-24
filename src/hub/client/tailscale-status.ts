import { HubDiscoveryConfigurationError } from "./errors.js";
import { normalizeMagicDnsSuffix, normalizeTailnetDnsName } from "./magic-dns.js";

export type TailscaleStatusProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export interface TailscaleStatusProcess {
  run(executable: "tailscale", args: readonly ["status", "--json"]): Promise<TailscaleStatusProcessResult>;
}

export type TailscaleDiscoveryState = Readonly<{
  magicDnsSuffix: string;
  peerDnsNames: readonly string[];
}>;

export async function readTailscaleMagicDnsSuffix(process: TailscaleStatusProcess): Promise<string> {
  return (await readTailscaleDiscoveryState(process)).magicDnsSuffix;
}

export async function readTailscaleDiscoveryState(process: TailscaleStatusProcess): Promise<TailscaleDiscoveryState> {
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
  const magicDnsSuffix = normalizeMagicDnsSuffix(value.MagicDNSSuffix);
  const selfDnsName = isRecord(value.Self)
    ? normalizeTailnetDnsName(value.Self.DNSName, magicDnsSuffix)
    : null;
  const peers = isRecord(value.Peer) ? Object.values(value.Peer) : [];
  const peerDnsNames = peers
    .filter((peer): peer is Record<string, unknown> => isRecord(peer) && peer.Online !== false)
    .map((peer) => normalizeTailnetDnsName(peer.DNSName, magicDnsSuffix))
    .filter((name): name is string => name !== null && name !== selfDnsName)
    .sort();
  return { magicDnsSuffix, peerDnsNames: [...new Set(peerDnsNames)] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
