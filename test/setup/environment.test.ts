import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SetupEnvironmentDetector } from "../../src/setup/environment.js";
import { SystemProcessPort } from "../../src/setup/process.js";
import type { ProcessPort, ProcessResult } from "../../src/setup/types.js";

test("setup environment detects authenticated Tailscale and Docker Compose", async () => {
  const detector = new SetupEnvironmentDetector(processes({
    tailscalePath: "/bin/tailscale",
    dockerPath: "/bin/docker",
    tailscaleStatus: ok("{}"),
    dockerCompose: ok("Docker Compose version v2.39.0")
  }));
  assert.deepEqual(await detector.detect(), { tailscale: "authenticated", docker: "available" });
});

test("setup environment distinguishes missing tools from required login", async () => {
  const detector = new SetupEnvironmentDetector(processes({
    tailscalePath: "/bin/tailscale",
    tailscaleStatus: { exitCode: 1, stdout: "", stderr: "not logged in" }
  }));
  assert.deepEqual(await detector.detect(), { tailscale: "needs-login", docker: "missing" });
});

test("process discovery can use an application-bundled executable outside PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "skillloom-executable-fallback-"));
  const executable = join(root, "tailscale");
  try {
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);
    const processes = new SystemProcessPort("", { tailscale: [executable] });
    assert.equal(await processes.findExecutable("tailscale"), executable);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function processes(state: {
  tailscalePath?: string;
  dockerPath?: string;
  tailscaleStatus?: ProcessResult;
  dockerCompose?: ProcessResult;
}): ProcessPort {
  return {
    async findExecutable(name) {
      if (name === "tailscale") return state.tailscalePath ?? null;
      if (name === "docker") return state.dockerPath ?? null;
      return null;
    },
    async run(executable) {
      return executable.includes("tailscale")
        ? state.tailscaleStatus ?? { exitCode: 1, stdout: "", stderr: "" }
        : state.dockerCompose ?? { exitCode: 1, stdout: "", stderr: "" };
    }
  };
}

function ok(stdout: string): ProcessResult {
  return { exitCode: 0, stdout, stderr: "" };
}
