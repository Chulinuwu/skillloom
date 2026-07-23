import type { ProcessPort } from "../setup/types.js";

export async function hubCapabilitiesHealthy(
  processes: ProcessPort,
  hubUrl: string,
  environment: NodeJS.ProcessEnv
): Promise<boolean> {
  const url = new URL("/v1/hello", hubUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net")) return false;
  const curl = await processes.findExecutable("curl");
  if (!curl) return false;
  const response = await processes.run(curl, [
    "--fail-with-body",
    "--silent",
    "--show-error",
    "--max-time",
    "5",
    "--proto",
    "=https",
    "--max-redirs",
    "0",
    url.href
  ], environment, 7_000);
  if (response.exitCode !== 0) return false;
  try {
    const body: unknown = JSON.parse(response.stdout);
    return isRecord(body)
      && isRecord(body.tailnetIdentity)
      && typeof body.tailnetIdentity.actorId === "string"
      && Array.isArray(body.grantedCapabilities)
      && body.grantedCapabilities.includes("brain:read")
      && body.grantedCapabilities.includes("skill:read");
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
