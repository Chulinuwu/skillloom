import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HostService } from "../../src/host/service.js";
import { prepareHostState } from "../../src/host/state.js";
import type { ConsentPort, ProcessPort } from "../../src/setup/types.js";
const packageRoot = process.cwd();
test("host install uses host Tailscale Serve and reports both Tailnet surfaces", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: { TS_AUTHKEY: "ignored-secret" } }
  );
  const result = await service.install(true);
  assert.equal(result.status, "running");
  assert.equal(result.surfaces?.hub.url, "https://main-hub.example.ts.net");
  assert.equal(result.surfaces?.obsidian.url, "https://main-hub.example.ts.net:8443");
  assert.equal(result.surfaces?.obsidian.externalPort, 8443);
  assert.equal(result.surfaces?.obsidian.internalPort, 3000);
  assert.deepEqual(result.surfaces?.obsidian.workspaces, {
    library: { path: "Library", access: "read-only" },
    dashboards: { path: "Bases", access: "writable-ui-state" },
    authoring: { path: "Authoring", access: "writable-staging" }
  });
  assert.doesNotMatch(await readFile(join(hostRoot, "host.env"), "utf8"), /TS_AUTHKEY|ignored-secret/u);
  const obsidianProfile = await readFile(join(hostRoot, "obsidian-config", ".config", "obsidian", "obsidian.json"), "utf8");
  assert.match(obsidianProfile, /"path":"\/config\/Documents\/Skillloom"/u);
  assert.match(obsidianProfile, /"open":true/u);
  assert.equal((await stat(join(hostRoot, "obsidian-config", "vault-config"))).isDirectory(), true);
  assert.equal((await stat(join(hostRoot, "data", "brain", "projections", "obsidian-vault"))).isDirectory(), true);
  assert.equal((await stat(join(hostRoot, "data", "brain", "projections", "obsidian-vault", ".obsidian"))).isDirectory(), true);
  assert.equal((await stat(join(hostRoot, "data", "brain", "projections", "obsidian-vault", "Bases"))).isDirectory(), true);
  assert.equal((await stat(join(hostRoot, "data", "brain", "projections", "obsidian-vault", "Authoring"))).isDirectory(), true);
  assert.equal((await stat(join(hostRoot, "data", "brain", "obsidian-ui", "Bases"))).isDirectory(), true);
  const policy = await readFile(join(hostRoot, "policy.hujson"), "utf8");
  assert.match(policy, /src: \["owner@github"\]/u);
  assert.match(policy, /dst: \["autogroup:self"\]/u);
  assert.match(policy, /ip: \["tcp:443", "tcp:8443"\]/u);
  assert.match(policy, /subject: "user:owner@github"/u);
  assert.match(policy, /roles: \["reader", "contributor", "promoter"\]/u);
  assert.doesNotMatch(policy, /replace-me|svc:skillloom/u);
  assert.equal(calls.filter((args) => args.includes("--wait-timeout") && args.includes("180")).length, 1);
  assert.ok(calls.some((args) => args.join(" ") === "serve --bg --yes --accept-app-caps=skillloom.io/cap/skillloom --https=443 http://127.0.0.1:8787"));
  assert.ok(calls.some((args) => args.join(" ") === "serve --bg --yes --https=8443 http://127.0.0.1:3000"));
  assert.equal(calls.some((args) => args.includes("--https=8443") && args.some((arg) => arg.startsWith("--accept-app-caps="))), false);
  assert.ok(calls.some((args) => args.join(" ") === "serve status"));
  assert.equal(calls.some((args) => args.join(" ").includes("funnel")), false);
});

test("host upgrade pauses Obsidian before migrating persistent workspace state", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-upgrade-"));
  await prepareHostState(hostRoot, "{}");
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  );

  await service.install(true);

  const stopIndex = calls.findIndex((args) => args.at(-2) === "stop" && args.at(-1) === "obsidian");
  const upIndex = calls.findIndex((args) => args.includes("up"));
  assert.ok(stopIndex >= 0);
  assert.ok(upIndex > stopIndex);
});

test("main hub install stops before Docker when host Tailscale is not authenticated", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-no-login-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "needs-login"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /human Tailscale login/u);
  assert.equal(calls.some((args) => args.includes("up")), false);
});

test("main hub install stops before Docker when Tailscale has no human identity", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-no-identity-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "missing-identity"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /authenticated Tailscale user identity/u);
  assert.equal(calls.some((args) => args.includes("up")), false);
});
test("host install preserves Docker state for retry when Serve verification fails", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-serve-failure-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "serve-status"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /Serve verification failed/u);
  assert.ok(calls.some((args) => args.includes("up")));
  assert.equal(calls.some((args) => args.includes("down")), false);
});
test("host install starts Docker Desktop on macOS and resumes when the daemon becomes ready", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-docker-start-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls, "docker-stopped"), consent: consent(), localBackendsHealthy: healthyBackends, wait: async () => {} },
    { packageRoot, hostRoot, env: {}, platform: "darwin" }
  );
  const result = await service.install(true);
  assert.equal(result.status, "running");
  assert.ok(calls.some((args) => args.join(" ") === "-a Docker"));
  assert.ok(calls.filter((args) => args.join(" ") === "info").length >= 2);
});
test("host install opens a trusted one-time Tailscale Serve approval page instead of hanging", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-serve-approval-"));
  const calls: string[][] = [];
  const approvalUrl = "https://login.tailscale.com/f/serve?node=test-node";
  const service = new HostService(
    { processes: processPort(calls, "serve-approval"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {}, platform: "darwin" }
  );
  await assert.rejects(() => service.install(true), /one-time tailnet approval/u);
  assert.ok(calls.some((args) => args.join(" ") === approvalUrl));
  assert.equal(calls.some((args) => args.join(" ").includes("funnel")), false);
});
test("host status does not report URLs until both private Serve routes are configured", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-serve-missing-"));
  await new HostService(
    { processes: processPort([]), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  ).install(true);
  const result = await new HostService(
    { processes: processPort([], "serve-missing"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  ).status();
  assert.equal(result.status, "running");
  assert.equal(result.surfaces, null);
});
test("host status stops requesting a policy merge after authenticated capabilities are verified", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-capabilities-"));
  const service = new HostService(
    { processes: processPort([], "capabilities-ready"), consent: consent(), localBackendsHealthy: healthyBackends },
    { packageRoot, hostRoot, env: {} }
  );
  const result = await service.install(true);
  assert.equal(result.status, "running");
  assert.doesNotMatch(result.nextActions.join("\n"), /Merge the personalized grant/iu);
});

test("host install reports backend failure without tearing down persistent containers", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-backend-failure-"));
  const calls: string[][] = [];
  const service = new HostService(
    {
      processes: processPort(calls),
      consent: consent(),
      localBackendsHealthy: async () => false,
      wait: async () => {}
    },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /host-loopback backends are not reachable/u);
  assert.ok(calls.some((args) => args.includes("up")));
  assert.equal(calls.some((args) => args.includes("down")), false);
});

test("host install waits for transient backend startup", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-backend-retry-"));
  let attempts = 0;
  const service = new HostService(
    {
      processes: processPort([]),
      consent: consent(),
      localBackendsHealthy: async () => {
        attempts += 1;
        return attempts === 3;
      },
      wait: async () => {}
    },
    { packageRoot, hostRoot, env: {} }
  );
  assert.equal((await service.install(true)).status, "running");
  assert.equal(attempts, 3);
});
function processPort(calls: string[][], fail: "none" | "needs-login" | "missing-identity" | "serve-status" | "serve-missing" | "docker-stopped" | "serve-approval" | "capabilities-ready" = "none"): ProcessPort {
  let dockerInfoAttempts = 0;
  return {
    async findExecutable(name) {
      if (name === "docker") return "/usr/bin/docker";
      if (name === "tailscale") return "/usr/bin/tailscale";
      if (name === "open") return "/usr/bin/open";
      if (name === "curl" && fail === "capabilities-ready") return "/usr/bin/curl";
      return null;
    },
    async run(executable, args) {
      calls.push(args);
      if (executable.endsWith("docker") && args[0] === "compose" && args[1] === "version") return { exitCode: 0, stdout: "Docker Compose version v2", stderr: "" };
      if (executable.endsWith("docker") && args[0] === "info") {
        dockerInfoAttempts += 1;
        return fail === "docker-stopped" && dockerInfoAttempts === 1
          ? { exitCode: 1, stdout: "", stderr: "daemon unavailable" }
          : { exitCode: 0, stdout: "ready", stderr: "" };
      }
      if (executable.endsWith("open") && args.join(" ") === "-a Docker") return { exitCode: 0, stdout: "", stderr: "" };
      if (executable.endsWith("docker") && args.includes("stop")) return { exitCode: 0, stdout: "stopped", stderr: "" };
      if (executable.endsWith("docker") && args.includes("up")) return { exitCode: 0, stdout: "started", stderr: "" };
      if (executable.endsWith("docker") && args.includes("down")) return { exitCode: 0, stdout: "removed", stderr: "" };
      if (executable.endsWith("docker") && args.includes("ps")) return { exitCode: 0, stdout: "skillloom-hub\nobsidian\n", stderr: "" };
      if (executable.endsWith("open")) return { exitCode: 0, stdout: "", stderr: "" };
      if (executable.endsWith("curl")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            tailnetIdentity: { actorId: "user:owner@github", kind: "user" },
            grantedCapabilities: ["brain:read", "skill:read"]
          }),
          stderr: ""
        };
      }
      if (executable.endsWith("tailscale") && args.join(" ") === "status --json") {
        if (fail === "needs-login") return { exitCode: 1, stdout: "", stderr: "login required" };
        if (fail === "missing-identity") {
          return { exitCode: 0, stdout: JSON.stringify({ Self: { DNSName: "main-hub.example.ts.net." }, User: {} }), stderr: "" };
        }
        return {
              exitCode: 0,
              stdout: JSON.stringify({
                Self: { DNSName: "main-hub.example.ts.net.", UserID: 42 },
                User: { "42": { LoginName: "owner@github" } }
              }),
              stderr: ""
            };
      }
      if (executable.endsWith("tailscale") && args.join(" ") === "serve status") {
        if (fail === "serve-status") return { exitCode: 0, stdout: "https://main-hub.example.ts.net funnel", stderr: "" };
        if (fail === "serve-missing") return { exitCode: 0, stdout: "No serve config\n", stderr: "" };
        return { exitCode: 0, stdout: "https://main-hub.example.ts.net -> http://127.0.0.1:8787\nhttps://main-hub.example.ts.net:8443 -> http://127.0.0.1:3000\n", stderr: "" };
      }
      if (executable.endsWith("tailscale") && args[0] === "serve") {
        return fail === "serve-approval"
          ? { exitCode: 124, stdout: "Serve is not enabled. To enable, visit:\nhttps://login.tailscale.com/f/serve?node=test-node\n", stderr: "" }
          : { exitCode: 0, stdout: "served", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unexpected" };
    }
  };
}
function consent(): ConsentPort {
  return { interactive: false, async confirm() { return false; } };
}

async function healthyBackends(): Promise<boolean> {
  return true;
}
