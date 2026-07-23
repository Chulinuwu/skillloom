import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTEXT_MAX_AGE_MS, CONTEXT_MAX_TOOL_DELTA } from "./context-config.mjs";

const STATE_VERSION = 1;

export async function issueContextCapsule(root, options) {
  const previous = await readContextState(root, options.sessionId);
  const epoch = (previous?.epoch ?? 0) + 1;
  const issuedAt = options.now ?? new Date().toISOString();
  const state = {
    version: STATE_VERSION,
    capsuleId: capsuleId(root, options.sessionId, epoch, options.mode),
    epoch,
    mode: options.mode,
    source: options.source,
    issuedAt,
    issuedToolCount: options.toolCount ?? previous?.issuedToolCount ?? 0,
    reviewedTranscriptBytes: previous?.reviewedTranscriptBytes ?? 0,
    lastReviewedAt: previous?.lastReviewedAt ?? null
  };
  await writeContextState(root, options.sessionId, state);
  return state;
}

export async function readContextState(root, sessionId) {
  try {
    const value = JSON.parse(await readFile(statePath(root, sessionId), "utf8"));
    return isContextState(value) ? value : null;
  } catch {
    return null;
  }
}

export function evaluateContextFreshness(state, options) {
  if (!state) {
    return { fresh: false, reason: "missing-capsule" };
  }
  if (state.mode !== options.mode) {
    return { fresh: false, reason: "mode-changed" };
  }
  const issuedAt = Date.parse(state.issuedAt);
  if (!Number.isFinite(issuedAt) || options.now - issuedAt >= CONTEXT_MAX_AGE_MS) {
    return { fresh: false, reason: "capsule-expired" };
  }
  if (options.toolCount !== null) {
    if (options.toolCount < state.issuedToolCount) {
      return { fresh: false, reason: "tool-count-reset" };
    }
    if (options.toolCount - state.issuedToolCount >= CONTEXT_MAX_TOOL_DELTA) {
      return { fresh: false, reason: "tool-budget-exhausted" };
    }
  }
  return { fresh: true, reason: "current" };
}

export async function markLearningReviewed(root, sessionId, state, transcriptBytes, reviewedAt = new Date().toISOString()) {
  const next = {
    ...state,
    reviewedTranscriptBytes: transcriptBytes,
    lastReviewedAt: reviewedAt
  };
  await writeContextState(root, sessionId, next);
  return next;
}

export function ephemeralCapsule(root, mode) {
  return {
    capsuleId: capsuleId(root, "untracked", 1, mode),
    epoch: 1,
    tracked: false
  };
}

async function writeContextState(root, sessionId, state) {
  const directory = join(root, ".skillloom", "context");
  const path = statePath(root, sessionId);
  const temporary = join(directory, `.${sessionKey(root, sessionId)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function statePath(root, sessionId) {
  return join(root, ".skillloom", "context", `${sessionKey(root, sessionId)}.json`);
}

function sessionKey(root, sessionId) {
  return createHash("sha256").update(`${root}\0${sessionId}`).digest("hex").slice(0, 24);
}

function capsuleId(root, sessionId, epoch, mode) {
  return createHash("sha256").update(`${root}\0${sessionId}\0${epoch}\0${mode}`).digest("hex").slice(0, 12);
}

function isContextState(value) {
  return typeof value === "object"
    && value !== null
    && value.version === STATE_VERSION
    && typeof value.capsuleId === "string"
    && Number.isInteger(value.epoch)
    && (value.mode === "manual" || value.mode === "policy" || value.mode === "hermes")
    && typeof value.source === "string"
    && typeof value.issuedAt === "string"
    && Number.isInteger(value.issuedToolCount)
    && Number.isInteger(value.reviewedTranscriptBytes)
    && (value.lastReviewedAt === null || typeof value.lastReviewedAt === "string");
}
