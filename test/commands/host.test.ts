import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HostService } from "../../src/host/service.js";
import type { ConsentPort, ProcessPort } from "../../src/setup/types.js";
const packageRoot = process.cwd();
test("host install uses host Tailscale Serve and reports both Tailnet surfaces", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls), consent: consent() },
    { packageRoot, hostRoot, env: { TS_AUTHKEY: "ignored-secret" } }
  );
  const result = await service.install(true);
  assert.equal(result.status, "running");
  assert.equal(result.surfaces?.hub.url, "https://main-hub.example.ts.net");
  assert.equal(result.surfaces?.obsidian.url, "https://main-hub.example.ts.net:8443");
  assert.equal(result.surfaces?.obsidian.externalPort, 8443);
  assert.equal(result.surfaces?.obsidian.internalPort, 3000);
  assert.equal(result.surfaces?.obsidian.access, "read-only");
  assert.doesNotMatch(await readFile(join(hostRoot, "host.env"), "utf8"), /TS_AUTHKEY|ignored-secret/u);
  assert.equal(calls.filter((args) => args.includes("--wait-timeout") && args.includes("180")).length, 1);
  assert.ok(calls.some((args) => args.join(" ") === "serve --bg --https=443 http://127.0.0.1:8787"));
  assert.ok(calls.some((args) => args.join(" ") === "serve --bg --https=8443 http://127.0.0.1:3000"));
  assert.ok(calls.some((args) => args.join(" ") === "serve status"));
  assert.equal(calls.some((args) => args.join(" ").includes("funnel")), false);
});
test("main hub install stops before Docker when host Tailscale is not authenticated", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-no-login-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "needs-login"), consent: consent() },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /human Tailscale login/u);
  assert.equal(calls.some((args) => args.includes("up")), false);
});
test("host install preserves Docker state for retry when Serve verification fails", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-serve-failure-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "serve-status"), consent: consent() },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /Serve verification failed/u);
  assert.ok(calls.some((args) => args.includes("up")));
  assert.equal(calls.some((args) => args.includes("down")), false);
});
function processPort(calls: string[][], fail: "none" | "needs-login" | "serve-status" = "none"): ProcessPort {
  return {
    async findExecutable(name) {
      if (name === "docker") return "/usr/bin/docker";
      if (name === "tailscale") return "/usr/bin/tailscale";
      return null;
    },
    async run(executable, args) {
      calls.push(args);
      if (executable.endsWith("docker") && args[0] === "compose" && args[1] === "version") return { exitCode: 0, stdout: "Docker Compose version v2", stderr: "" };
      if (executable.endsWith("docker") && args.includes("up")) return { exitCode: 0, stdout: "started", stderr: "" };
      if (executable.endsWith("docker") && args.includes("down")) return { exitCode: 0, stdout: "removed", stderr: "" };
      if (executable.endsWith("docker") && args.includes("ps")) return { exitCode: 0, stdout: "skillloom-hub\nobsidian\n", stderr: "" };
      if (executable.endsWith("tailscale") && args.join(" ") === "status --json") {
        return fail === "needs-login"
          ? { exitCode: 1, stdout: "", stderr: "login required" }
          : { exitCode: 0, stdout: JSON.stringify({ Self: { DNSName: "main-hub.example.ts.net." } }), stderr: "" };
      }
      if (executable.endsWith("tailscale") && args.join(" ") === "serve status") {
        return fail === "serve-status"
          ? { exitCode: 0, stdout: "https://main-hub.example.ts.net funnel", stderr: "" }
          : { exitCode: 0, stdout: "https://main-hub.example.ts.net -> http://127.0.0.1:8787\nhttps://main-hub.example.ts.net:8443 -> http://127.0.0.1:3000\n", stderr: "" };
      }
      if (executable.endsWith("tailscale") && args[0] === "serve") return { exitCode: 0, stdout: "served", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "unexpected" };
    }
  };
}
function consent(): ConsentPort {
  return { interactive: false, async confirm() { return false; } };
}
