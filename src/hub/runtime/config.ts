export type HubRuntimeConfig = Readonly<{
  bindHost: "127.0.0.1" | "0.0.0.0";
  port: number;
  dataDir: string;
  appCapability: string;
  obsidianAuthoringEnabled: boolean;
  obsidianAuthoringIntervalMs: number;
}>;

const defaultAppCapability = "skillloom.io/cap/skillloom";

export function loadHubRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HubRuntimeConfig {
  const bindHost = env.SKILLLOOM_HUB_BIND_HOST ?? "127.0.0.1";
  if (bindHost !== "127.0.0.1" && bindHost !== "0.0.0.0") {
    throw new Error("SKILLLOOM_HUB_BIND_HOST must be 127.0.0.1 or 0.0.0.0");
  }
  return {
    bindHost,
    port: parsePort(env.SKILLLOOM_HUB_PORT ?? "8787"),
    dataDir: requiredString(env.SKILLLOOM_HUB_DATA_DIR, "SKILLLOOM_HUB_DATA_DIR"),
    appCapability: capabilityName(env.SKILLLOOM_HUB_APP_CAP ?? env.SKILLLOOM_APP_CAP ?? defaultAppCapability),
    obsidianAuthoringEnabled: parseBoolean(env.SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED ?? "true", "SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED"),
    obsidianAuthoringIntervalMs: parseInterval(env.SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS ?? "1000")
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

function parseBoolean(value: string, name: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseInterval(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS must be an integer from 250 to 3600000");
  const interval = Number(value);
  if (!Number.isSafeInteger(interval) || interval < 250 || interval > 3_600_000) {
    throw new Error("SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS must be an integer from 250 to 3600000");
  }
  return interval;
}
