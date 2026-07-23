import { UsageError } from "../domain/errors.js";
import type { ProcessPort, ProcessResult } from "../setup/types.js";

export async function configurePrivateServe(
  processes: ProcessPort,
  tailscale: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Promise<void> {
  await configure(
    processes,
    tailscale,
    environment,
    platform,
    "443",
    "http://127.0.0.1:8787",
    "Skillloom Hub",
    "skillloom.io/cap/skillloom"
  );
  await configure(processes, tailscale, environment, platform, "8443", "http://127.0.0.1:3000", "Obsidian");
  if (!await privateServeConfigured(processes, tailscale, environment)) {
    throw new Error("Tailscale Serve verification failed; Docker state was preserved for retry");
  }
}

export async function privateServeConfigured(
  processes: ProcessPort,
  tailscale: string,
  environment: NodeJS.ProcessEnv
): Promise<boolean> {
  const status = await processes.run(tailscale, ["serve", "status"], environment, 10_000);
  return status.exitCode === 0
    && !/funnel/iu.test(status.stdout)
    && status.stdout.includes("127.0.0.1:8787")
    && status.stdout.includes("127.0.0.1:3000");
}

async function configure(
  processes: ProcessPort,
  tailscale: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  port: string,
  target: string,
  surface: string,
  acceptedCapability?: string
): Promise<void> {
  const capabilityArgs = acceptedCapability ? [`--accept-app-caps=${acceptedCapability}`] : [];
  const result = await processes.run(
    tailscale,
    ["serve", "--bg", "--yes", ...capabilityArgs, `--https=${port}`, target],
    environment,
    15_000
  );
  if (result.exitCode === 0) return;
  const approvalUrl = tailscaleApprovalUrl(result);
  if (approvalUrl) {
    await openApprovalPage(processes, approvalUrl, environment, platform);
    throw new UsageError(`Tailscale Serve needs one-time tailnet approval. Approve ${approvalUrl} and rerun setup; Docker state was preserved.`);
  }
  throw new Error(`Tailscale Serve could not publish ${surface}; Docker state was preserved for retry`);
}

function tailscaleApprovalUrl(result: ProcessResult): string | null {
  const candidate = `${result.stdout}\n${result.stderr}`.match(/https:\/\/login\.tailscale\.com\/f\/serve\?[^\s]+/u)?.[0];
  if (!candidate) return null;
  const url = new URL(candidate);
  return url.protocol === "https:" && url.hostname === "login.tailscale.com" && url.pathname === "/f/serve" ? url.href : null;
}

async function openApprovalPage(
  processes: ProcessPort,
  url: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): Promise<void> {
  if (platform !== "darwin") return;
  const open = await processes.findExecutable("open");
  if (open) await processes.run(open, [url], environment, 10_000);
}
