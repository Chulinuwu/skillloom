import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { UsageError } from "../../src/domain/errors.js";
import { SetupService } from "../../src/setup/service.js";
import type {
  ConsentPort,
  HarnessInstallerPort,
  HubSetupPort,
  SetupHarnessTarget
} from "../../src/setup/types.js";

test("non-interactive setup requires explicit trust consent before side effects", async () => {
  const calls: string[] = [];
  const service = new SetupService(
    hub(calls),
    installer(calls),
    consent(false, true),
    { stateRoot: await mkdtemp(join(tmpdir(), "skillloom-setup-consent-")), packageRoot: "/package", packageVersion: "1.0.0" }
  );

  await assert.rejects(() => service.setup({ target: "auto", hub: "auto", scope: "user", yes: false }), /requires --yes/u);
  assert.deepEqual(calls, ["hub.discover"]);
});

test("interactive setup honors a declined trust prompt", async () => {
  const calls: string[] = [];
  const service = new SetupService(
    hub(calls),
    installer(calls),
    consent(true, false, calls),
    { stateRoot: await mkdtemp(join(tmpdir(), "skillloom-setup-decline-")), packageRoot: "/package", packageVersion: "1.0.0" }
  );

  await assert.rejects(() => service.setup({ target: "auto", hub: "auto", scope: "project", yes: false }), /declined/u);
  assert.deepEqual(calls, ["hub.discover", "consent.confirm"]);
});

test("setup checkpoints successful targets and retries only partial failures", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "skillloom-setup-retry-"));
  const calls: string[] = [];
  let codexFails = true;
  const harness: HarnessInstallerPort = {
    async detect(target) {
      calls.push(`detect:${target}`);
      return true;
    },
    async install(request) {
      calls.push(`install:${request.target}`);
      if (request.target === "codex" && codexFails) {
        return { target: request.target, status: "failed", message: "temporary failure" };
      }
      return { target: request.target, status: "installed", message: "ok" };
    }
  };
  const service = new SetupService(hub(calls), harness, consent(false, true), {
    stateRoot,
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });

  const first = await service.setup({ target: "auto", hub: "auto", scope: "user", yes: true });
  assert.deepEqual(first.targets.map(({ target, status }) => [target, status]), [
    ["claude", "installed"],
    ["codex", "failed"],
    ["agents", "installed"]
  ]);
  codexFails = false;
  const second = await service.setup({ target: "auto", hub: "auto", scope: "user", yes: true });
  assert.deepEqual(second.targets.map(({ target, status }) => [target, status]), [
    ["claude", "unchanged"],
    ["codex", "installed"],
    ["agents", "unchanged"]
  ]);
  assert.equal(calls.filter((call) => call === "install:claude").length, 1);
  assert.equal(calls.filter((call) => call === "install:codex").length, 2);
  assert.equal(calls.filter((call) => call === "install:agents").length, 1);
  const state = JSON.parse(await readFile(join(stateRoot, "setup.json"), "utf8")) as { completed: Record<string, unknown> };
  assert.deepEqual(Object.keys(state.completed).sort(), ["agents:user", "claude:user", "codex:user"]);
});

test("sync delegates dry-run and apply modes without installing harnesses", async () => {
  const calls: string[] = [];
  const service = new SetupService(
    hub(calls),
    installer(calls),
    consent(false, true),
    { stateRoot: await mkdtemp(join(tmpdir(), "skillloom-sync-")), packageRoot: "/package", packageVersion: "1.0.0" }
  );

  const dryRun = await service.sync(false);
  const applied = await service.sync(true);

  assert.equal(dryRun.applied, false);
  assert.equal(applied.applied, true);
  assert.deepEqual(calls, ["hub.reconcile:false", "hub.reconcile:true"]);
});

test("setup reports a thrown installer failure and continues later targets", async () => {
  const calls: string[] = [];
  const service = new SetupService(hub(calls), {
    async detect() {
      return true;
    },
    async install(request) {
      if (request.target === "claude") throw new Error("installer crashed");
      return { target: request.target, status: "installed", message: "ok" };
    }
  }, consent(false, true), {
    stateRoot: await mkdtemp(join(tmpdir(), "skillloom-setup-thrown-")),
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });

  const result = await service.setup({ target: "auto", hub: "auto", scope: "user", yes: true });
  assert.deepEqual(result.targets.map(({ target, status }) => [target, status]), [
    ["claude", "failed"],
    ["codex", "installed"],
    ["agents", "installed"]
  ]);
  assert.equal(result.targets[0].message, "installer crashed");
});

test("connected setup verifies Brain read before installing harnesses", async () => {
  const calls: string[] = [];
  const service = new SetupService(hub(calls), installer(calls), consent(false, true), {
    stateRoot: await mkdtemp(join(tmpdir(), "skillloom-setup-verify-")),
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  await service.setup({ target: "codex", hub: "auto", scope: "user", yes: true });
  assert.deepEqual(calls, [
    "hub.discover",
    "hub.trust",
    "hub.verifyBrainRead",
    "hub.reconcile:true:strict",
    "detect:codex",
    "install:codex"
  ]);
});

test("connected setup stops before installation when Brain read verification fails", async () => {
  const calls: string[] = [];
  const stateRoot = await mkdtemp(join(tmpdir(), "skillloom-setup-verify-fail-"));
  const service = new SetupService(hub(calls, { verifyError: new Error("HUB_FORBIDDEN") }), installer(calls), consent(false, true), {
    stateRoot,
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  await assert.rejects(() => service.setup({ target: "codex", hub: "auto", scope: "user", yes: true }), /HUB_FORBIDDEN/u);
  assert.deepEqual(calls, ["hub.discover", "hub.trust", "hub.verifyBrainRead"]);
  await assert.rejects(() => readFile(join(stateRoot, "setup.json"), "utf8"));
});
test("connected setup stops before installation when initial registry reconcile goes offline", async () => {
  const calls: string[] = [];
  const stateRoot = await mkdtemp(join(tmpdir(), "skillloom-setup-reconcile-offline-"));
  const service = new SetupService(hub(calls, { reconcileOffline: true }), installer(calls), consent(false, true), {
    stateRoot,
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  await assert.rejects(
    () => service.setup({ target: "codex", hub: "auto", scope: "user", yes: true }),
    (error: unknown) => error instanceof UsageError && /--hub local/u.test(error.message)
  );
  assert.deepEqual(calls, ["hub.discover", "hub.trust", "hub.verifyBrainRead", "hub.reconcile:true:strict"]);
  await assert.rejects(() => readFile(join(stateRoot, "setup.json"), "utf8"));
});
test("sync keeps offline reconcile as a result instead of throwing", async () => {
  const calls: string[] = [];
  const service = new SetupService(hub(calls, { reconcileOffline: true }), installer(calls), consent(false, true), {
    stateRoot: await mkdtemp(join(tmpdir(), "skillloom-sync-offline-")),
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  const result = await service.sync(true);
  assert.deepEqual(result, { command: "sync", applied: false, pulled: 0, imported: 0, conflicts: ["Hub is offline"] });
  assert.deepEqual(calls, ["hub.reconcile:true"]);
});

test("local-only setup does not verify Hub Brain access", async () => {
  const calls: string[] = [];
  const service = new SetupService(hub(calls), installer(calls), consent(false, true), {
    stateRoot: await mkdtemp(join(tmpdir(), "skillloom-setup-local-")),
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  const result = await service.setup({ target: "agents", hub: "local", scope: "project", yes: true });
  assert.equal(result.hub.mode, "local-only");
  assert.deepEqual(calls, ["detect:agents", "install:agents"]);
});

test("auto setup fails instead of silently falling back when Hub is unavailable", async () => {
  const calls: string[] = [];
  const stateRoot = await mkdtemp(join(tmpdir(), "skillloom-setup-auto-offline-"));
  const service = new SetupService(hub(calls, { localOnly: true }), installer(calls), consent(false, true), {
    stateRoot,
    packageRoot: "/package",
    packageVersion: "1.0.0"
  });
  await assert.rejects(() => service.setup({ target: "agents", hub: "auto", scope: "project", yes: true }), /--hub local/u);
  assert.deepEqual(calls, ["hub.discover"]);
  await assert.rejects(() => readFile(join(stateRoot, "setup.json"), "utf8"));
});

function hub(calls: string[], options: { localOnly?: boolean; verifyError?: Error; reconcileOffline?: boolean } = {}): HubSetupPort {
  return {
    async discover() {
      calls.push("hub.discover");
      if (options.localOnly) return { mode: "local-only" };
      return { mode: "connected", endpoint: "https://skillloom.example.ts.net", hubInstanceId: "hub-1", signingKeyFingerprint: "key-1" };
    },
    async trust() {
      calls.push("hub.trust");
      return { trusted: true };
    },
    async verifyBrainRead() {
      calls.push("hub.verifyBrainRead");
      if (options.verifyError) throw options.verifyError;
      return { verified: true };
    },
    async reconcile({ apply, strictInitial }) {
      calls.push(`hub.reconcile:${apply}${strictInitial ? ":strict" : ""}`);
      if (options.reconcileOffline && strictInitial) {
        throw new UsageError("Skillloom Hub became unavailable during setup registry reconcile; fix Hub connectivity and rerun setup, or rerun with --hub local for explicit local-only setup");
      }
      if (options.reconcileOffline) return { applied: false, pulled: 0, imported: 0, conflicts: ["Hub is offline"] };
      return { applied: apply, pulled: 0, imported: 0, conflicts: [] };
    }
  };
}

function installer(calls: string[]): HarnessInstallerPort {
  return {
    async detect(target: SetupHarnessTarget) {
      calls.push(`detect:${target}`);
      return true;
    },
    async install(request) {
      calls.push(`install:${request.target}`);
      return { target: request.target, status: "installed", message: "ok" };
    }
  };
}

function consent(interactive: boolean, accepted: boolean, calls?: string[]): ConsentPort {
  return {
    interactive,
    async confirm() {
      calls?.push("consent.confirm");
      return accepted;
    }
  };
}
