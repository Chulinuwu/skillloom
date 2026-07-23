import { setTimeout as delay } from "node:timers/promises";
import { UsageError } from "../domain/errors.js";
import type { ProcessPort } from "../setup/types.js";
import type { DockerReadinessOptions } from "./types.js";

export async function ensureDockerReady(
  processes: ProcessPort,
  docker: string,
  options: DockerReadinessOptions
): Promise<void> {
  if (await daemonReady(processes, docker, options.env)) return;
  if (options.platform !== "darwin") {
    throw new UsageError("Docker is installed but its daemon is not running; start Docker and rerun setup");
  }
  const open = await processes.findExecutable("open");
  if (!open) throw new UsageError("Docker Desktop is installed but Skillloom could not start it; open Docker and rerun setup");
  const start = await processes.run(open, ["-a", "Docker"], options.env);
  if (start.exitCode !== 0) throw new UsageError("Docker Desktop could not be started; open Docker and rerun setup");
  const wait = options.wait ?? delay;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await wait(1_000);
    if (await daemonReady(processes, docker, options.env)) return;
  }
  throw new UsageError("Docker Desktop did not become ready within 60 seconds; wait for it to finish starting and rerun setup");
}

async function daemonReady(processes: ProcessPort, docker: string, environment: NodeJS.ProcessEnv): Promise<boolean> {
  return (await processes.run(docker, ["info"], environment)).exitCode === 0;
}
