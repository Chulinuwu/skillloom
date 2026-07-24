import assert from "node:assert/strict";
import test from "node:test";
import { SetupRolePlanner, assertSafeSetupStepCommands, resolveSetupRole } from "../../src/setup/role-plan.js";
import type { SetupGuidanceSource } from "../../src/setup/types.js";

const source: SetupGuidanceSource = {
  kind: "official-doc",
  title: "Tailscale Serve",
  url: "https://tailscale.com/docs/features/tailscale-serve",
  fetchedAt: "2026-07-22T00:00:00.000Z",
  pageDate: "6 months ago",
  contentHash: "sha256:test",
  snippets: ["tailscale serve configures a private tailnet service"]
};

const dockerSource: SetupGuidanceSource = {
  kind: "official-doc",
  title: "Docker Compose install",
  url: "https://docs.docker.com/compose/install/",
  fetchedAt: "2026-07-22T00:00:00.000Z",
  contentHash: "sha256:docker",
  snippets: ["docker compose version verifies Compose v2"]
};

test("setup role inference keeps link-based setup as a client node", () => {
  assert.equal(resolveSetupRole({ target: "auto", hub: "auto", hubUrl: "https://skillloom.example.ts.net", scope: "user", yes: false }), "client-node");
  assert.equal(resolveSetupRole({ target: "auto", hub: "local", scope: "user", yes: false }), "local-only");
  assert.equal(resolveSetupRole({ target: "auto", hub: "auto", scope: "user", yes: false }), null);
});

test("main hub plan separates automatic stack work from unavoidable human authority", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source, dockerSource];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: false, role: "main-hub" },
    { tailscale: "needs-login", docker: "missing" }
  );
  assert.equal(plan.role, "main-hub");
  assert.equal(plan.status, "needs-human");
  assert.deepEqual(plan.sources, [source, dockerSource]);
  assert.ok(plan.steps.some((step) => step.id === "tailscale-login" && step.action === "human"));
  assert.ok(plan.steps.some((step) => step.id === "install-docker-compose" && step.action === "human"));
  assert.ok(plan.steps.some((step) => step.id === "start-private-stack" && step.action === "automatic"));
  assert.ok(plan.steps.filter((step) => step.action === "human").every((step) => step.sourceTitles && step.sourceTitles.length > 0));
  assert.ok(plan.warnings.some((warning) => /Remote Login and SSH are not Skillloom prerequisites/u.test(warning)));
  assert.ok(plan.warnings.some((warning) => /Funnel/u.test(warning)));
  assert.ok(plan.warnings.some((warning) => /TS_AUTHKEY/u.test(warning)));
});

test("authenticated main hub plan does not require unnecessary service approval", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source, dockerSource];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: true, role: "main-hub" },
    { tailscale: "authenticated", docker: "available" }
  );
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.steps.map((step) => [step.id, step.action]), [
    ["start-private-stack", "automatic"],
    ["verify-tailnet-access", "automatic"]
  ]);
  assert.doesNotMatch(JSON.stringify(plan), /approve-service-policy|svc:/iu);
});

test("client node plan trusts a credential-free URL before installing harnesses", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", hubUrl: "https://skillloom.example.ts.net", scope: "user", yes: true, role: "client-node" },
    { tailscale: "authenticated", docker: "missing" }
  );
  assert.equal(plan.role, "client-node");
  assert.equal(plan.status, "needs-human");
  assert.deepEqual(plan.steps.map((step) => step.id), ["discover-hub", "trust-hub", "install-plugin-integrations"]);
  assert.equal(plan.steps[0].action, "automatic");
  assert.deepEqual(plan.steps[0].sourceTitles, ["Tailscale Serve"]);
  assert.doesNotMatch(JSON.stringify(plan), /funnel --yes/iu);
  assert.doesNotMatch(JSON.stringify(plan), /tailscale up/iu);
});

test("source-bound step references always point to collected guidance sources", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source, dockerSource];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: true, role: "main-hub" },
    { tailscale: "missing", docker: "missing" }
  );
  const titles = new Set(plan.sources.map((item) => item.title));
  for (const step of plan.steps) {
    for (const title of step.sourceTitles ?? []) {
      assert.equal(titles.has(title), true);
    }
  }
});

test("local-only plan stays single-machine and does not require Tailscale", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "local", scope: "user", yes: true, role: "local-only" },
    { tailscale: "missing", docker: "missing" }
  );
  assert.equal(plan.role, "local-only");
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.steps.map((step) => step.id), ["install-plugin-integrations"]);
});

test("local-only plan does not require external dynamic guidance evidence", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "local", scope: "user", yes: true, role: "local-only" },
    { tailscale: "missing", docker: "missing" }
  );
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.warnings, [
    "Setup operates only on this device; Remote Login and SSH are not Skillloom prerequisites.",
    "Tailscale Funnel is not part of Skillloom setup; use private Tailscale Serve only.",
    "Secret-bearing values such as TS_AUTHKEY must stay in the local environment and never be pasted into chat."
  ]);
});

test("setup plan blocks when dynamic official docs and CLI help are unavailable", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: true, role: "client-node" },
    { tailscale: "authenticated", docker: "available" }
  );
  assert.equal(plan.status, "blocked");
  assert.ok(plan.warnings.some((warning) => /must not guess/u.test(warning)));
});

test("ambiguous setup role blocks before silently choosing a client node", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [source, dockerSource];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: true },
    { tailscale: "authenticated", docker: "available" }
  );
  assert.equal(plan.role, "role-required");
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.steps.map((step) => step.id), ["choose-setup-role"]);
  assert.match(plan.steps[0].title, /host the Brain on this device/u);
});

test("external setup steps block when their source evidence is missing", async () => {
  const planner = new SetupRolePlanner({ async collect() {
    return [{ ...source, title: "Unrelated official doc", snippets: ["portable skills"] }];
  } });
  const plan = await planner.plan(
    { target: "auto", hub: "auto", scope: "user", yes: true, role: "client-node" },
    { tailscale: "missing", docker: "available" }
  );
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.steps[0].sourceTitles, []);
  assert.ok(plan.warnings.some((warning) => /missing required/u.test(warning)));
});

test("setup plan command validation rejects Funnel and secret-bearing commands", () => {
  assert.throws(() => assertSafeSetupStepCommands([
    { id: "bad", title: "bad", action: "automatic", command: "tailscale funnel 443", verification: "never" }
  ]), /Funnel/u);
  assert.throws(() => assertSafeSetupStepCommands([
    { id: "bad", title: "bad", action: "human", command: "export TS_AUTHKEY=value", verification: "never" }
  ]), /auth keys/u);
});
