import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SetupRolePlanner } from "../../src/setup/role-plan.js";
import { SetupService } from "../../src/setup/service.js";
import type {
  ConsentPort,
  HarnessInstallerPort,
  HubSetupDiscovery,
  HubSetupPort,
  SetupEnvironment,
  SetupGuidanceSource,
  SetupHarnessTarget,
  SetupHostPort
} from "../../src/setup/types.js";

const tailscaleSource: SetupGuidanceSource = {
  kind: "official-doc",
  title: "Tailscale Serve",
  url: "https://tailscale.com/docs/features/tailscale-serve",
  fetchedAt: "2026-07-22T00:00:00.000Z",
  contentHash: "sha256:tailscale",
  snippets: ["tailscale serve publishes private tailnet services"]
};

const dockerSource: SetupGuidanceSource = {
  kind: "official-doc",
  title: "Docker Compose install",
  url: "https://docs.docker.com/compose/install/",
  fetchedAt: "2026-07-22T00:00:00.000Z",
  contentHash: "sha256:docker",
  snippets: ["docker compose version verifies Compose v2"]
};

test("local-only role installs local integrations without Hub or Tailscale side effects", async () => {
  const calls: string[] = [];
  const result = await service(calls, { sources: [tailscaleSource, dockerSource], environment: { tailscale: "missing", docker: "missing" } })
    .setup({ target: "auto", hub: "local", scope: "user", yes: true, role: "local-only" });

  assert.equal(result.hub.mode, "local-only");
  assert.equal(result.surfaces, null);
  assert.deepEqual(result.targets.map(({ target, status }) => [target, status]), [
    ["claude", "installed"],
    ["codex", "installed"],
    ["agents", "installed"]
  ]);
  assert.deepEqual(calls, ["environment.detect", "sources.collect", "detect:claude", "install:claude", "detect:codex", "install:codex", "detect:agents", "install:agents"]);
});

test("main-hub role reports private Hub and split Obsidian workspaces after setup", async () => {
  const calls: string[] = [];
  const result = await service(calls, { sources: [tailscaleSource, dockerSource], environment: { tailscale: "authenticated", docker: "available" } })
    .setup({ target: "auto", hub: "auto", scope: "user", yes: true, role: "main-hub" });

  assert.equal(result.plan?.role, "main-hub");
  assert.equal(result.host?.status, "running");
  assert.equal(result.surfaces?.hub.url, "https://skillloom.tailnet.ts.net");
  assert.equal(result.surfaces?.obsidian.url, "https://skillloom.tailnet.ts.net:8443");
  assert.deepEqual(result.surfaces?.obsidian.workspaces, {
    library: { path: "Library", access: "read-only" },
    dashboards: { path: "Bases", access: "writable-ui-state" },
    authoring: { path: "Authoring", access: "writable-staging" }
  });
  assert.deepEqual(calls, [
    "environment.detect",
    "sources.collect",
    "host.install:true",
    "hub.discover:https://skillloom.tailnet.ts.net",
    "hub.trust",
    "hub.verifyBrainRead",
    "hub.reconcile:true:strict",
    "detect:claude",
    "install:claude",
    "detect:codex",
    "install:codex",
    "detect:agents",
    "install:agents"
  ]);
});

test("client-node role trusts and verifies a credential-free Hub URL before installation", async () => {
  const calls: string[] = [];
  const result = await service(calls, { sources: [tailscaleSource], environment: { tailscale: "authenticated", docker: "missing" } })
    .setup({ target: "codex", hub: "auto", hubUrl: "https://skillloom.tailnet.ts.net", scope: "user", yes: true, role: "client-node" });

  assert.equal(result.hub.mode, "connected");
  assert.equal(result.hub.mode === "connected" ? result.hub.endpoint : null, "https://skillloom.tailnet.ts.net");
  assert.deepEqual(calls, ["environment.detect", "sources.collect", "hub.discover:https://skillloom.tailnet.ts.net", "hub.trust", "hub.verifyBrainRead", "hub.reconcile:true:strict", "detect:codex", "install:codex"]);
});

test("blocked dynamic guidance performs no trust, reconcile, or installation side effects", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => service(calls, { sources: [], environment: { tailscale: "authenticated", docker: "available" } })
      .setup({ target: "auto", hub: "auto", hubUrl: "https://skillloom.tailnet.ts.net", scope: "user", yes: true, role: "client-node" }),
    /Setup plan is blocked/u
  );

  assert.deepEqual(calls, ["environment.detect", "sources.collect"]);
});

test("main-hub role never emits Funnel, TS_AUTHKEY, or service-key setup defaults", async () => {
  const calls: string[] = [];
  const result = await service(calls, { sources: [tailscaleSource, dockerSource], environment: { tailscale: "authenticated", docker: "available" } })
    .setup({ target: "agents", hub: "auto", scope: "user", yes: true, role: "main-hub" });
  const serialized = JSON.stringify(result.plan?.steps.map((step) => step.command ?? ""));

  assert.doesNotMatch(serialized, /\bfunnel\b/iu);
  assert.doesNotMatch(serialized, /\bTS_AUTHKEY\b/u);
  assert.doesNotMatch(serialized, /\bsvc:/iu);
});

function service(calls: string[], options: { sources: SetupGuidanceSource[]; environment: SetupEnvironment }): SetupService {
  return new SetupService(
    hub(calls),
    installer(calls),
    consent(),
    { stateRoot: awaitlessTempRoot(), packageRoot: "/package", packageVersion: "1.0.0" },
    { async detect() {
      calls.push("environment.detect");
      return options.environment;
    } },
    new SetupRolePlanner({ async collect() {
      calls.push("sources.collect");
      return options.sources;
    } }),
    host(calls)
  );
}

function awaitlessTempRoot(): string {
  return join(tmpdir(), `skillloom-setup-e2e-${process.pid}-${Math.random().toString(16).slice(2)}`);
}

function hub(calls: string[]): HubSetupPort {
  return {
    async discover(_root: string, hubUrl?: string): Promise<HubSetupDiscovery> {
      calls.push(`hub.discover:${hubUrl ?? "auto"}`);
      return {
        mode: "connected",
        endpoint: hubUrl ?? "https://skillloom.tailnet.ts.net",
        hubInstanceId: "hub-1",
        signingKeyFingerprint: "key-1"
      };
    },
    async trust() {
      calls.push("hub.trust");
      return { trusted: true };
    },
    async verifyBrainRead() {
      calls.push("hub.verifyBrainRead");
      return { verified: true };
    },
    async reconcile({ apply, strictInitial }) {
      calls.push(`hub.reconcile:${apply}${strictInitial ? ":strict" : ""}`);
      return { applied: apply, pulled: 1, imported: 1, conflicts: [] };
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

function consent(): ConsentPort {
  return {
    interactive: false,
    async confirm() {
      throw new Error("unexpected consent prompt");
    }
  };
}

function host(calls: string[]): SetupHostPort {
  return {
    async install(yes) {
      calls.push(`host.install:${yes}`);
      return {
        command: "host",
        action: "install",
        status: "running",
        root: "/host",
        policyPath: "/host/policy.hujson",
        surfaces: {
          hub: { url: "https://skillloom.tailnet.ts.net", externalPort: 443 },
          obsidian: {
            url: "https://skillloom.tailnet.ts.net:8443",
            externalPort: 8443,
            internalPort: 3000,
            workspaces: {
              library: { path: "Library", access: "read-only" },
              dashboards: { path: "Bases", access: "writable-ui-state" },
              authoring: { path: "Authoring", access: "writable-staging" }
            }
          }
        },
        nextActions: ["Open Obsidian from another tailnet device"]
      };
    }
  };
}
