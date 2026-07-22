import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HostService } from "../../src/host/service.js";
import type { ConsentPort, ProcessPort } from "../../src/setup/types.js";

const packageRoot = process.cwd();

test("host install keeps the auth key out of durable state and reports both Tailnet surfaces", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls), consent: consent() },
    { packageRoot, hostRoot, env: { TS_AUTHKEY: "test-only-secret" } }
  );
  const result = await service.install(true);
  assert.equal(result.status, "running");
  assert.equal(result.surfaces?.hub.url, "https://skillloom.example.ts.net");
  assert.equal(result.surfaces?.obsidian.url, "https://skillloom-obsidian.example.ts.net");
  assert.equal(result.surfaces?.obsidian.externalPort, 443);
  assert.equal(result.surfaces?.obsidian.internalPort, 3000);
  assert.equal(result.surfaces?.obsidian.access, "read-only");
  assert.doesNotMatch(await readFile(join(hostRoot, "host.env"), "utf8"), /test-only-secret/u);
  assert.equal(calls.filter((args) => args.includes("--wait-timeout") && args.includes("180")).length, 2);
});

test("first host install stops before Docker when the Tailscale auth key is missing", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-no-key-"));
  const calls: string[][] = [];
  const service = new HostService(
    { processes: processPort(calls), consent: consent() },
    { packageRoot, hostRoot, env: {} }
  );
  await assert.rejects(() => service.install(true), /TS_AUTHKEY.*environment/u);
  assert.deepEqual(calls, []);
});

test("host install removes containers without the auth key when credential scrubbing fails", async () => {
  const hostRoot = await mkdtemp(join(tmpdir(), "skillloom-host-scrub-failure-"));
  const calls: Array<{ args: string[]; authKey: string | undefined }> = [];
  const service = new HostService(
    { processes: processPort([], "scrub", calls), consent: consent() },
    { packageRoot, hostRoot, env: { TS_AUTHKEY: "test-only-secret" } }
  );
  await assert.rejects(() => service.install(true), /could not remove the bootstrap credential/u);
  const cleanup = calls.find(({ args }) => args.includes("down"));
  assert.ok(cleanup);
  assert.equal(cleanup.authKey, "");
});

function processPort(
  calls: string[][],
  fail: "none" | "scrub" = "none",
  detailedCalls: Array<{ args: string[]; authKey: string | undefined }> = []
): ProcessPort {
  return {
    async findExecutable(name) {
      assert.equal(name, "docker");
      return "/usr/bin/docker";
    },
    async run(_executable, args, environment) {
      calls.push(args);
      detailedCalls.push({ args, authKey: environment?.TS_AUTHKEY });
      if (args[0] === "compose" && args[1] === "version") return { exitCode: 0, stdout: "Docker Compose version v2", stderr: "" };
      if (args.includes("up")) {
        if (args.includes("--force-recreate")) assert.equal(environment?.TS_AUTHKEY, "");
        if (fail === "scrub" && args.includes("--force-recreate")) return { exitCode: 1, stdout: "", stderr: "failed" };
        return { exitCode: 0, stdout: "started", stderr: "" };
      }
      if (args.includes("down")) return { exitCode: 0, stdout: "removed", stderr: "" };
      if (args.includes("ps")) return { exitCode: 0, stdout: "tailscale\nskillloom-hub\nobsidian\n", stderr: "" };
      if (args.includes("status") && args.includes("--json")) {
        return { exitCode: 0, stdout: JSON.stringify({ MagicDNSSuffix: "example.ts.net." }), stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unexpected" };
    }
  };
}

function consent(): ConsentPort {
  return { interactive: false, async confirm() { return false; } };
}
