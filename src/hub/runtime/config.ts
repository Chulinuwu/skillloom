export type HubRuntimeConfig = Readonly<{
  bindHost: "127.0.0.1";
  port: number;
  dataDir: string;
  appCapability: string;
}>;

const defaultAppCapability = "skillloom.io/cap/skillloom";

export function loadHubRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HubRuntimeConfig {
  const bindHost = env.SKILLLOOM_HUB_BIND_HOST ?? "127.0.0.1";
  if (bindHost !== "127.0.0.1") throw new Error("SKILLLOOM_HUB_BIND_HOST must be 127.0.0.1");
  return {
    bindHost,
    port: parsePort(env.SKILLLOOM_HUB_PORT ?? "8787"),
    dataDir: requiredString(env.SKILLLOOM_HUB_DATA_DIR, "SKILLLOOM_HUB_DATA_DIR"),
    appCapability: capabilityName(env.SKILLLOOM_HUB_APP_CAP ?? env.SKILLLOOM_APP_CAP ?? defaultAppCapability)
  };
}

function parsePort(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("SKILLLOOM_HUB_PORT must be a TCP port");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) throw new Error("SKILLLOOM_HUB_PORT must be a TCP port");
  return port;
}

function requiredString(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`${name} is required`);
  return value;
}

function capabilityName(value: string): string {
  if (!/^[a-z0-9.-]+\/cap\/[a-z0-9._-]+$/.test(value)) throw new Error("Hub app capability name is invalid");
  return value;
}
