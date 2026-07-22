import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const read = (path: string) => readFile(join(root, path), "utf8");

test("compose exposes Hub only on host loopback for host Tailscale Serve", async () => {
  const compose = await read("hub/compose.yaml");

  assert.doesNotMatch(compose, /image: tailscale\/tailscale/u);
  assert.doesNotMatch(compose, /network_mode: service:tailscale/u);
  assert.match(compose, /"127\.0\.0\.1:8787:8787"/u);
  assert.match(compose, /SKILLLOOM_HUB_BIND_HOST: 127\.0\.0\.1/u);
  assert.doesNotMatch(compose, /TS_AUTHKEY/u);
  assert.doesNotMatch(compose, /0\.0\.0\.0/u);
  assert.doesNotMatch(compose, /^\s*expose:/mu);
  assert.doesNotMatch(compose, /funnel/iu);
});
test("compose exposes a hardened Obsidian library and isolated writable authoring workspace", async () => {
  const compose = await read("hub/compose.yaml");
  assert.match(compose, /lscr\.io\/linuxserver\/obsidian:v1\.12\.7-ls139/u);
  assert.match(compose, /"127\.0\.0\.1:3000:3000"/u);
  assert.match(compose, /HARDEN_DESKTOP: "true"/u);
  assert.match(compose, /START_DOCKER: "false"/u);
  assert.match(compose, /SELKIES_ENABLE_SHARING: "false"/u);
  assert.match(compose, /brain\/projections\/obsidian:\/config\/Documents\/Skillloom\/Library:ro/u);
  assert.match(compose, /brain\/authoring:\/config\/Documents\/Skillloom\/Authoring:rw/u);
  assert.doesNotMatch(compose, /:\/config\/Documents\/Skillloom\/Library:rw/u);
  assert.doesNotMatch(compose, /:\/config\/Documents\/Skillloom\/Authoring:ro/u);
  assert.doesNotMatch(compose, /:\/config\/Documents\/Skillloom\s*$/mu);
  assert.match(compose, /SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED: \$\{SKILLLOOM_OBSIDIAN_AUTHORING_ENABLED:-true\}/u);
  assert.match(compose, /SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS: \$\{SKILLLOOM_OBSIDIAN_AUTHORING_INTERVAL_MS:-1000\}/u);
});

test("host service configures private Tailscale Serve without Funnel or auth keys", async () => {
  const service = await read("src/host/service.ts");

  assert.match(service, /findExecutable\("tailscale"\)/u);
  assert.match(service, /"serve", "--bg", "--https=443", "http:\/\/127\.0\.0\.1:8787"/u);
  assert.match(service, /"serve", "--bg", "--https=8443", "http:\/\/127\.0\.0\.1:3000"/u);
  assert.match(service, /"serve", "status"/u);
  assert.doesNotMatch(service, /TS_AUTHKEY/u);
  assert.doesNotMatch(service, /funnel [^-]/iu);
});

test("deployment artifacts keep state persistent and private", async () => {
  const [compose, ignore, dockerfile] = await Promise.all([
    read("hub/compose.yaml"),
    read(".gitignore"),
    read("hub/Dockerfile")
  ]);

  assert.match(compose, /SKILLLOOM_HUB_DATA_DIR:-\.\/data\}:\/data/u);
  assert.match(ignore, /hub\/data\//u);
  assert.match(ignore, /hub\/obsidian-config\//u);
  assert.match(dockerfile, /FROM node:24\.15\.0-bookworm-slim AS build/u);
  assert.match(dockerfile, /127\.0\.0\.1:8787\/healthz/u);
  assert.match(dockerfile, /USER node/u);
});

test("backup and restore scripts verify snapshots without pretending to encrypt", async () => {
  const [backup, restore, readme] = await Promise.all([
    read("hub/scripts/backup.sh"),
    read("hub/scripts/restore.sh"),
    read("hub/README.md")
  ]);

  assert.match(backup, /sha256sum "\$archive" > "\$manifest"/u);
  assert.match(backup, /shasum -a 256 "\$archive" > "\$manifest"/u);
  assert.match(restore, /sha256sum -c "\$manifest"/u);
  assert.match(restore, /shasum -a 256 "\$archive"/u);
  assert.match(restore, /target data directory must be empty/u);
  assert.match(readme, /stopped-Hub snapshot/u);
  assert.match(readme, /backup-compose\.sh/u);
  assert.match(readme, /Encrypt the resulting tarball with your own backup system/u);
});

test("policy example grants explicit human and tagged-agent subjects instead of relying on IP identity", async () => {
  const policy = await read("hub/policy.example.hujson");
  assert.match(policy, /"group:skillloom-contributors": \["replace-me@example\.com"\]/u);
  assert.match(policy, /subject: "user:replace-me@example\.com"/u);
  assert.match(policy, /"group:skillloom-promoters": \["replace-me-promoter@example\.com"\]/u);
  assert.match(policy, /subject: "user:replace-me-promoter@example\.com"/u);
  assert.match(policy, /roles: \["reader", "contributor", "promoter"\]/u);
  assert.doesNotMatch(policy, /autogroup:member/u);

  assert.match(policy, /"tag:skillloom-hub"/u);
  assert.match(policy, /"tag:skillloom-agent"/u);
  assert.match(policy, /"skillloom\.io\/cap\/skillloom"/u);
  assert.match(policy, /subject: "node:skillloom-agent"/u);
  assert.match(policy, /roles: \["reader", "contributor"\]/u);
});

test("policy example keeps every sample human identity in one app-capability grant", async () => {
  const policy = await read("hub/policy.example.hujson");
  assert.equal((policy.match(/replace-me@example\.com/gu) ?? []).length, 2);
  assert.equal((policy.match(/replace-me-promoter@example\.com/gu) ?? []).length, 2);
});

test("Hub instructions explain role promotion without broadening human access", async () => {
  const readme = await read("hub/README.md");
  assert.match(readme, /move that identity from `group:skillloom-contributors` to `group:skillloom-promoters`/u);
  assert.match(readme, /do not place the same email in both groups/u);
  assert.match(readme, /Do not replace them with `autogroup:member`/u);
});

test("live acceptance harness separates server, remote actor, and aggregate phases", async () => {
  const script = await read("hub/scripts/live-acceptance.sh");
  assert.match(script, /umask 077/u);
  assert.match(script, /SKILLLOOM_LIVE_ACCEPTANCE=1/u);
  assert.match(script, /SKILLLOOM_ACCEPTANCE_PHASE=server, actor, or aggregate/u);
  assert.match(script, /SKILLLOOM_ACCEPTANCE_ACTOR=contributor or restricted/u);
  assert.match(script, /SKILLLOOM_ACCEPTANCE_RUN_NONCE/u);
  assert.match(script, /bare MagicDNS HTTPS origin/u);
  assert.match(script, /\/tmp\/skillloom-live-acceptance/u);
  assert.match(script, /evidence directory must be outside tracked source/u);
  assert.match(script, /pwd -P/u);
  assert.match(script, /chmod 700/u);
  assert.match(script, /chmod 600/u);
  assert.match(script, /must not be a symlink/u);
  assert.match(script, /INCOMPLETE: phase/u);
  assert.equal((script.match(/PASS: live tailnet acceptance/gu) ?? []).length, 1);
});

test("server acceptance uses the exact Compose services and private Tailscale path", async () => {
  const script = await read("hub/scripts/live-acceptance.sh");
  assert.match(script, /docker compose -f "\$compose_file" --env-file "\$env_file"/u);
  assert.match(script, /printf '%s\\n' obsidian skillloom-hub/u);
  assert.match(script, /compose config --services/u);
  assert.match(script, /compose ps --status running --services/u);
  assert.match(script, /tailscale serve status/u);
  assert.match(script, /healthz/u);
  assert.match(script, /loopback-backend-reachable/u);
  assert.match(script, /identity-persistence/u);
  assert.match(script, /while \[ "\$attempt" -lt 60 \]/u);
  assert.doesNotMatch(script, /sleep 5/u);
  assert.doesNotMatch(script, /for service in tailscale skillloom/u);
});

test("actor acceptance needs no Docker files and checks authentic permissions on valid routes", async () => {
  const script = await read("hub/scripts/live-acceptance.sh");
  const actorStart = script.indexOf("run_actor_phase() {");
  const actorEnd = script.indexOf("secure_evidence_input() {");
  assert.notEqual(actorStart, -1);
  assert.notEqual(actorEnd, -1);
  const actorSection = script.slice(actorStart, actorEnd);
  assert.doesNotMatch(actorSection, /docker|compose_file|env_file/u);
  assert.match(script, /grantedCapabilities/u);
  assert.match(script, /\/v1\/brain\/captures/u);
  assert.match(script, /\/v1\/brain\/search/u);
  assert.match(script, /\/v1\/registry\/releases/u);
  assert.match(script, /candidateId:"acceptance-candidate",version:"0\.0\.0-acceptance",channel:"stable"/u);
  assert.match(script, /spoofed-publish-denied/u);
  assert.match(script, /expected HTTP 403 from spoofed publish/u);
  assert.doesNotMatch(script, /SKILLLOOM_EXPECTED_ROLES|authentic-roles|\/v1\/brain\/capture\b/u);
});

test("aggregate phase passes only complete evidence with a canonical signing-key fingerprint", async () => {
  const evidenceDir = await mkdtemp(join(tmpdir(), "skillloom-live-aggregate-"));
  await chmod(evidenceDir, 0o700);
  const runNonce = "acceptance-run-1234";
  const hubUrl = "https://skillloom.example.ts.net";
  const hubInstanceId = "11111111-1111-4111-8111-111111111111";
  const signingKeyFingerprint = `sha256:${"A".repeat(43)}`;
  const common = { schemaVersion: 1, runNonce, hubUrl, hubInstanceId, status: "complete", failedCheck: null };
  await writeEvidence(join(evidenceDir, "server.json"), {
    ...common,
    phase: "server",
    actorMode: null,
    signingKeyFingerprint: null,
    grantedCapabilities: [],
    checks: [
      "compose-services",
      "compose-loopback-bindings",
      "compose-no-public-ports",
      "compose-running",
      "serve-private",
      "magicdns-https",
      "loopback-backend-reachable",
      "identity-persistence"
    ]
  });
  await writeEvidence(join(evidenceDir, "actor-contributor.json"), {
    ...common,
    phase: "actor",
    actorMode: "contributor",
    signingKeyFingerprint,
    grantedCapabilities: ["brain:capture", "brain:link", "brain:read", "brain:update", "skill:propose", "skill:read"],
    checks: ["negotiation-capabilities", "contributor-capture"]
  });
  await writeEvidence(join(evidenceDir, "actor-restricted.json"), {
    ...common,
    phase: "actor",
    actorMode: "restricted",
    signingKeyFingerprint,
    grantedCapabilities: ["brain:read", "skill:read"],
    checks: ["negotiation-capabilities", "restricted-read", "spoofed-publish-denied"]
  });
  const result = runAcceptance(evidenceDir, runNonce, hubUrl);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: live tailnet acceptance/u);
  const aggregate = JSON.parse(await readFile(join(evidenceDir, "aggregate.json"), "utf8"));
  assert.equal(aggregate.status, "pass");
  assert.equal(aggregate.hubInstanceId, hubInstanceId);
  assert.deepEqual(aggregate.checks, ["evidence-matched"]);
  for (const name of ["actor-contributor.json", "actor-restricted.json"]) {
    const actorEvidence = JSON.parse(await readFile(join(evidenceDir, name), "utf8"));
    actorEvidence.signingKeyFingerprint = "sha256:not-canonical";
    await writeEvidence(join(evidenceDir, name), actorEvidence);
  }
  const malformed = runAcceptance(evidenceDir, runNonce, hubUrl);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /aggregate-evidence/u);
});

test("aggregate phase exits incomplete when any remote phase evidence is missing", async () => {
  const evidenceDir = await mkdtemp(join(tmpdir(), "skillloom-live-incomplete-"));
  await chmod(evidenceDir, 0o700);
  const result = runAcceptance(evidenceDir, "acceptance-run-5678", "https://skillloom.example.ts.net");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /INCOMPLETE/u);
  const aggregate = JSON.parse(await readFile(join(evidenceDir, "aggregate.json"), "utf8"));
  assert.equal(aggregate.status, "incomplete");
  assert.equal(aggregate.failedCheck, "missing-phase-evidence");
});

test("actor mode is validated before it can influence an evidence path", async () => {
  const acceptanceRoot = await mkdtemp(join(tmpdir(), "skillloom-live-invalid-actor-"));
  const evidenceDir = join(acceptanceRoot, "evidence");
  await mkdir(join(evidenceDir, "actor-nested"), { recursive: true, mode: 0o700 });
  await chmod(evidenceDir, 0o700);
  const result = runAcceptance(
    evidenceDir,
    "acceptance-run-actor-invalid",
    "https://skillloom.example.ts.net",
    "actor",
    "nested/../../escaped"
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SKILLLOOM_ACCEPTANCE_ACTOR=contributor or restricted/u);
  await assert.rejects(() => readFile(join(acceptanceRoot, "escaped.json"), "utf8"), { code: "ENOENT" });
});

test("evidence output must name a dedicated directory", async () => {
  const acceptanceRoot = await mkdtemp(join(tmpdir(), "skillloom-live-evidence-root-"));
  const result = runAcceptance(
    `${acceptanceRoot}/.`,
    "acceptance-run-evidence-root",
    "https://skillloom.example.ts.net"
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dedicated directory/u);
  await assert.rejects(() => readFile(join(acceptanceRoot, "aggregate.json"), "utf8"), { code: "ENOENT" });
});

async function writeEvidence(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function runAcceptance(evidenceDir: string, runNonce: string, hubUrl: string, phase = "aggregate", actor = "") {
  return spawnSync("sh", [join(root, "hub/scripts/live-acceptance.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SKILLLOOM_LIVE_ACCEPTANCE: "1",
      SKILLLOOM_ACCEPTANCE_PHASE: phase,
      SKILLLOOM_ACCEPTANCE_ACTOR: actor,
      SKILLLOOM_ACCEPTANCE_RUN_NONCE: runNonce,
      SKILLLOOM_HUB_URL: hubUrl,
      SKILLLOOM_ACCEPTANCE_EVIDENCE_DIR: evidenceDir
    }
  });
}
