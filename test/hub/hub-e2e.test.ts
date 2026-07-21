import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import test from "node:test";
import { captureCommand } from "../../src/commands/capture.js";
import {
  createBrainApi,
  createHubHttpClient,
  createRegistryMutationApi,
  createRegistryRemotePort,
  drainPendingHubMutations,
  HubTrustChangedError,
  openHubSession,
  reconcileHubReleases,
  setupHubSession,
  type HubHttpClient
} from "../../src/hub/client/index.js";
import {
  enqueuePendingMutation,
  readHubPendingMutations,
  readHubTrust
} from "../../src/hub/config/index.js";
import { createHubRuntime, type HubRuntime } from "../../src/hub/runtime/service.js";
import { StableReleaseInstaller } from "../../src/setup/stable-apply.js";
import { listCandidates, readCandidate } from "../../src/store/candidates.js";
import { storeLayout } from "../../src/store/layout.js";
import { tempDir } from "../helpers/fixtures.js";

const appCapability = "skillloom.io/cap/skillloom";
const clientVersion = "0.2.1";
const reader = { login: "reader@example.com", roles: ["reader"] } as const;
const contributorA = { login: "contributor-a@example.com", roles: ["contributor"] } as const;
const contributorB = { login: "contributor-b@example.com", roles: ["contributor"] } as const;
const promoter = { login: "promoter@example.com", roles: ["promoter"] } as const;

test("two tailnet clients share Brain and verified stable skills without sharing mutable local state", async () => {
  const workspace = await tempDir("skillloom-hub-e2e-");
  const dataDir = join(workspace, "hub");
  const clientA = join(workspace, "client-a");
  const clientB = join(workspace, "client-b");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = runtimeEnv(dataDir, port);
  let runtime: HubRuntime | undefined = await createHubRuntime(env);
  await runtime.start();

  try {
    const aSession = await setupHubSession({
      root: clientA,
      clientVersion,
      developmentUrl: baseUrl,
      createClient: (url) => httpClient(url, contributorA),
      consent: { explicit: true, trustedAt: "2026-07-21T00:00:00.000Z" }
    });
    const bSession = await setupHubSession({
      root: clientB,
      clientVersion,
      developmentUrl: baseUrl,
      createClient: (url) => httpClient(url, reader),
      consent: { explicit: true, trustedAt: "2026-07-21T00:00:01.000Z" }
    });
    const aContributorClient = httpClient(baseUrl, contributorA);
    const bReaderClient = httpClient(baseUrl, reader);
    const promoterClient = httpClient(baseUrl, promoter);
    const brainA = createBrainApi(clientA, aContributorClient);
    const brainB = createBrainApi(clientB, bReaderClient);

    const sharedCaptureId = randomUUID();
    const sharedCaptureInput = {
      type: "note" as const,
      title: "Tailnet runbook",
      content: "Exact shared content from client A",
      provenance: { source: "client-a" },
      sensitivity: "tailnet" as const
    };
    const captured = await brainA.capture(sharedCaptureId, sharedCaptureInput);
    assert.equal(captured.kind, "artifact");
    const searchResults = await brainB.search({ query: "Tailnet runbook", limit: 10 });
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0]?.id, captured.artifact.id);
    assert.equal((await brainB.read(captured.artifact.id)).content, sharedCaptureInput.content);

    const updated = await brainA.update(randomUUID(), captured.artifact.id, {
      baseRevision: captured.artifact.revision,
      content: "Updated centrally by client A"
    });
    assert.equal(updated.kind, "artifact");
    const stale = await jsonRequest(baseUrl, contributorB, "PUT", `/v1/brain/${captured.artifact.id}`, {
      baseRevision: captured.artifact.revision,
      content: "Stale write from client B"
    }, randomUUID());
    assert.equal(stale.status, 409);
    assert.equal(pathString(stale.body, "error", "code"), "BRAIN_REVISION_CONFLICT");
    assert.equal(pathString(stale.body, "error", "details", "currentRevision"), updated.artifact.revision);

    const replayId = randomUUID();
    const replayInput = {
      type: "fact" as const,
      title: "Idempotent fact",
      content: "Stored exactly once",
      provenance: { source: "e2e" },
      sensitivity: "tailnet" as const
    };
    const firstReplay = await brainA.capture(replayId, replayInput);
    assert.deepEqual(await brainA.capture(replayId, replayInput), firstReplay);
    const replayAcknowledgement = await jsonRequest(baseUrl, contributorA, "POST", "/v1/brain/captures", replayInput, replayId);
    const repeatedAcknowledgement = await jsonRequest(baseUrl, contributorA, "POST", "/v1/brain/captures", replayInput, replayId);
    assert.equal(replayAcknowledgement.status, 201);
    assert.deepEqual(repeatedAcknowledgement, replayAcknowledgement);
    const conflictingReplay = await jsonRequest(baseUrl, contributorA, "POST", "/v1/brain/captures", {
      ...replayInput,
      content: "Different payload"
    }, replayId);
    assert.equal(conflictingReplay.status, 409);
    assert.equal(pathString(conflictingReplay.body, "error", "code"), "BRAIN_IDEMPOTENCY_CONFLICT");

    const proposal = skillProposal();
    assert.equal((await jsonRequest(baseUrl, reader, "POST", "/v1/brain/captures", sharedCaptureInput, randomUUID())).status, 403);
    assert.equal((await jsonRequest(baseUrl, reader, "POST", "/v1/registry/proposals", proposal, randomUUID())).status, 403);
    assert.equal((await jsonRequest(baseUrl, reader, "POST", "/v1/registry/releases", publishBody("cand-denied"), randomUUID())).status, 403);

    const divergent = await captureDivergentSkill(clientB, workspace);
    const registryA = createRegistryMutationApi(clientA, aContributorClient);
    const proposed = await registryA.propose(randomUUID(), proposal);
    const candidateId = proposed.candidate.payload.candidateId;
    assert.equal((await jsonRequest(baseUrl, contributorA, "POST", "/v1/registry/releases", publishBody(candidateId), randomUUID())).status, 403);
    const published = await createRegistryMutationApi(clientA, promoterClient).publish(randomUUID(), candidateId, "1.0.0");
    assert.equal(published.release.payload.name, "shared-skill");

    const bTrust = await readHubTrust(clientB);
    assert.ok(bTrust);
    const reconciliation = await reconcileHubReleases({
      root: clientB,
      remote: createRegistryRemotePort(bReaderClient),
      trust: bTrust,
      hub: {
        hubInstanceId: bSession.negotiation.hubInstanceId,
        releaseSigningPublicKey: bSession.negotiation.releaseSigningPublicKey
      },
      allowedCapabilities: [],
      apply: new StableReleaseInstaller("project", join(workspace, "client-b-home"))
    });
    assert.equal(reconciliation.mode, "reconciled");
    assert.equal(reconciliation.imported, 1);
    assert.equal(reconciliation.applied, 1);
    const candidatesAfterPull = await listCandidates(clientB);
    assert.equal(candidatesAfterPull.length, 2);
    assert.ok(candidatesAfterPull.some((candidate) => candidate.candidateId === divergent.candidateId));
    assert.equal((await readCandidate(clientB, divergent.candidateId)).packageHash, divergent.packageHash);
    assert.match(await readCandidateSkill(clientB, divergent.candidateId), /Local divergent workflow/u);
    assert.match(await readFile(join(clientB, ".claude", "skills", "shared-skill", "SKILL.md"), "utf8"), /Central stable workflow/u);
    assert.match(await readFile(join(clientB, ".agents", "skills", "shared-skill", "SKILL.md"), "utf8"), /Central stable workflow/u);

    const originalHubId = runtime.hubInstanceId;
    const originalSigningKey = runtime.signingPublicKey;
    const candidateSnapshot = candidatesAfterPull.map((candidate) => ({ candidateId: candidate.candidateId, packageHash: candidate.packageHash }));
    const installedSnapshot = await readFile(join(clientB, ".claude", "skills", "shared-skill", "SKILL.md"), "utf8");
    await runtime.close();
    runtime = undefined;

    runtime = await createHubRuntime(runtimeEnv(join(workspace, "replacement-id"), port));
    assert.notEqual(runtime.hubInstanceId, originalHubId);
    await runtime.start();
    await assert.rejects(
      () => openHubSession(sessionOptions(clientB, baseUrl, reader)),
      (error) => error instanceof HubTrustChangedError && error.message.includes("hubInstanceId")
    );
    await assertNoClientMaterialization(clientB, candidateSnapshot, installedSnapshot);
    await runtime.close();
    runtime = undefined;

    const replacementKeyDir = join(workspace, "replacement-key");
    const seed = await createHubRuntime(runtimeEnv(replacementKeyDir, port));
    await seed.close();
    await writeFile(join(replacementKeyDir, "runtime", "hub-instance-id"), `${originalHubId}\n`, "utf8");
    runtime = await createHubRuntime(runtimeEnv(replacementKeyDir, port));
    assert.equal(runtime.hubInstanceId, originalHubId);
    assert.notEqual(runtime.signingPublicKey, originalSigningKey);
    await runtime.start();
    await assert.rejects(
      () => openHubSession(sessionOptions(clientB, baseUrl, reader)),
      (error) => error instanceof HubTrustChangedError && error.message.includes("signingKeyFingerprint")
    );
    await assertNoClientMaterialization(clientB, candidateSnapshot, installedSnapshot);
    await runtime.close();
    runtime = undefined;

    runtime = await createHubRuntime(env);
    assert.equal(runtime.hubInstanceId, originalHubId);
    assert.equal(runtime.signingPublicKey, originalSigningKey);
    await runtime.start();
    const reopenedA = await openHubSession(sessionOptions(clientA, baseUrl, contributorA));
    const reopenedB = await openHubSession(sessionOptions(clientB, baseUrl, reader));
    assert.equal(reopenedA.mode, "connected");
    assert.equal(reopenedB.mode, "connected");
    if (reopenedA.mode !== "connected" || reopenedB.mode !== "connected") throw new Error("trusted Hub did not reconnect");
    const restartedBrainA = createBrainApi(clientA, reopenedA.client);
    const restartedBrainB = createBrainApi(clientB, reopenedB.client);
    assert.equal((await restartedBrainB.read(captured.artifact.id)).content, "Updated centrally by client A");
    assert.equal((await restartedBrainB.search({ query: "Tailnet runbook" }))[0]?.id, captured.artifact.id);
    assert.deepEqual(await restartedBrainA.capture(replayId, replayInput), firstReplay);
    assert.deepEqual(
      await jsonRequest(baseUrl, contributorA, "POST", "/v1/brain/captures", replayInput, replayId),
      replayAcknowledgement
    );

    const firstPendingId = randomUUID();
    const secondPendingId = randomUUID();
    await enqueuePendingMutation(clientA, pendingCapture(firstPendingId, "Offline first", "2026-07-21T01:00:00.000Z"));
    await enqueuePendingMutation(clientA, pendingCapture(secondPendingId, "Offline second", "2026-07-21T01:00:01.000Z"));
    const attempted: string[] = [];
    const failSecondFetch = authenticatedFetch(contributorA, async (input, init) => {
      const requestId = new Headers(init?.headers).get("idempotency-key") ?? "";
      attempted.push(requestId);
      if (requestId === secondPendingId) throw new TypeError("offline during second pending mutation");
      return await fetch(input, init);
    });
    await assert.rejects(
      () => drainPendingHubMutations(clientA, createHubHttpClient({
        baseUrl,
        fetch: failSecondFetch,
        retry: { maxAttempts: 1, baseDelayMs: 1 }
      })),
      /unavailable/u
    );
    assert.deepEqual(attempted, [firstPendingId, secondPendingId]);
    assert.deepEqual((await readHubPendingMutations(clientA)).map((mutation) => mutation.requestId), [secondPendingId]);
    assert.equal(await drainPendingHubMutations(clientA, httpClient(baseUrl, contributorA)), 1);
    assert.deepEqual(await readHubPendingMutations(clientA), []);
    const offlineResults = await restartedBrainB.search({ query: "Offline", limit: 10 });
    assert.deepEqual(new Set(offlineResults.map((result) => result.title)), new Set(["Offline first", "Offline second"]));

    assert.equal(aSession.negotiation.hubInstanceId, originalHubId);
  } finally {
    await runtime?.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

type Actor = Readonly<{ login: string; roles: readonly string[] }>;

function runtimeEnv(dataDir: string, port: number): NodeJS.ProcessEnv {
  return {
    SKILLLOOM_HUB_BIND_HOST: "127.0.0.1",
    SKILLLOOM_HUB_PORT: String(port),
    SKILLLOOM_HUB_DATA_DIR: dataDir,
    SKILLLOOM_HUB_APP_CAP: appCapability
  };
}

function sessionOptions(root: string, developmentUrl: string, actor: Actor) {
  return {
    root,
    clientVersion,
    developmentUrl,
    createClient: (url: string) => httpClient(url, actor)
  };
}

function httpClient(baseUrl: string, actor: Actor): HubHttpClient {
  return createHubHttpClient({
    baseUrl,
    fetch: authenticatedFetch(actor),
    retry: { maxAttempts: 1, baseDelayMs: 1 }
  });
}

function authenticatedFetch(
  actor: Actor,
  forward: typeof fetch = globalThis.fetch
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("tailscale-user-login", actor.login);
    headers.set("tailscale-app-capabilities", JSON.stringify({ [appCapability]: [{ roles: actor.roles }] }));
    return await forward(input, { ...init, headers });
  };
}

async function jsonRequest(
  baseUrl: string,
  actor: Actor,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  requestId: string
): Promise<{ status: number; body: unknown }> {
  const response = await authenticatedFetch(actor)(new URL(path, baseUrl), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "idempotency-key": requestId },
    redirect: "error"
  });
  return { status: response.status, body: await response.json() };
}

function pathString(value: unknown, ...path: string[]): string | undefined {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current) || !(segment in current)) return undefined;
    current = current[segment as keyof typeof current];
  }
  return typeof current === "string" ? current : undefined;
}

function skillProposal() {
  return {
    name: "shared-skill",
    baseReleaseHash: null,
    capabilities: [] as const,
    provenance: [],
    files: [{
      relativePath: "SKILL.md",
      mode: 0o644 as const,
      content: [
        "---",
        "name: shared-skill",
        "description: Central stable workflow shared across the tailnet.",
        "---",
        "",
        "Central stable workflow from the Skillloom Hub.",
        ""
      ].join("\n")
    }]
  };
}

function publishBody(candidateId: string) {
  return { candidateId, version: "1.0.0", channel: "stable" };
}

async function captureDivergentSkill(clientRoot: string, workspace: string) {
  const source = join(workspace, "local-source", "shared-skill");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "SKILL.md"), [
    "---",
    "name: shared-skill",
    "description: A preexisting local workflow that must be preserved.",
    "---",
    "",
    "Local divergent workflow owned by client B.",
    ""
  ].join("\n"), "utf8");
  return await captureCommand({
    command: "capture",
    source,
    createdBy: "human",
    evidence: ["preexisting local divergence"],
    json: false
  }, clientRoot);
}

async function readCandidateSkill(root: string, candidateId: string): Promise<string> {
  return await readFile(join(storeLayout(root).candidates, candidateId, "skill", "SKILL.md"), "utf8");
}

async function assertNoClientMaterialization(
  root: string,
  candidates: readonly Readonly<{ candidateId: string; packageHash: string }>[],
  installed: string
): Promise<void> {
  assert.deepEqual(
    (await listCandidates(root)).map((candidate) => ({ candidateId: candidate.candidateId, packageHash: candidate.packageHash })),
    candidates
  );
  assert.equal(await readFile(join(root, ".claude", "skills", "shared-skill", "SKILL.md"), "utf8"), installed);
}

function pendingCapture(requestId: string, title: string, createdAt: string) {
  return {
    requestId,
    method: "POST" as const,
    path: "/v1/brain/captures",
    body: JSON.stringify({
      type: "note",
      title,
      content: `${title} body`,
      provenance: { source: "offline-client-a" },
      sensitivity: "tailnet"
    }),
    createdAt
  };
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("No TCP port assigned"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
