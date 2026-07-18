> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Skillloom as a local-first, cross-agent skill learning lifecycle with safe promotion and rollback for Claude Code and Codex.

**Architecture:** A dependency-light TypeScript CLI owns canonical Agent Skill candidates, an append-only operation journal, deterministic trust checks, and transactional filesystem promotion. Harness adapters only resolve native discovery paths; bundled plugin skills remain harness-neutral.

**Tech Stack:** Node.js 20+, TypeScript, Node test runner, npm, Agent Skills `SKILL.md`, Claude Code plugin manifests, Codex plugin manifests.

**Execution note:** Commit steps are intentionally omitted because repository instructions prohibit creating commits unless the user explicitly asks.

## File map

- Create: `package.json` - package scripts, CLI binary, and publish allowlist.
- Create: `tsconfig.json` - strict ESM compilation.
- Create: `src/cli/main.ts` - CLI entry and exit-code boundary.
- Create: `src/cli/arguments.ts` - command parsing only.
- Create: `src/cli/output.ts` - stable JSON and human output.
- Create: `src/commands/*.ts` - one command workflow per file.
- Create: `src/domain/types.ts` - lifecycle discriminated unions.
- Create: `src/domain/errors.ts` - typed domain failures.
- Create: `src/config/defaults.ts` - stable config values.
- Create: `src/config/service.ts` - config loading and validation.
- Create: `src/files/atomic-write.ts` - same-directory atomic replacement.
- Create: `src/files/lock.ts` - exclusive mutation lock.
- Create: `src/files/tree.ts` - safe deterministic tree traversal.
- Create: `src/skills/frontmatter.ts` - minimal Agent Skills metadata parser.
- Create: `src/skills/hash.ts` - stable package hashing.
- Create: `src/skills/validate.ts` - package validation orchestration.
- Create: `src/security/patterns.ts` - scanner rule data.
- Create: `src/security/scan.ts` - scanner evaluation.
- Create: `src/store/layout.ts` - `.skillloom` paths.
- Create: `src/store/journal.ts` - append-only JSONL event store.
- Create: `src/store/candidates.ts` - candidate snapshots and metadata.
- Create: `src/store/promotions.ts` - promotion and backup records.
- Create: `src/adapters/types.ts` - adapter interface.
- Create: `src/adapters/claude-code.ts` - Claude discovery paths.
- Create: `src/adapters/codex.ts` - Codex discovery paths.
- Create: `src/adapters/generic.ts` - explicit directory target.
- Create: `src/adapters/registry.ts` - adapter selection.
- Create: `src/promotions/service.ts` - staged multi-target transaction.
- Create: `src/promotions/rollback.ts` - hash-guarded restoration.
- Create: `skills/capture-learning/SKILL.md` - agent learning workflow.
- Create: `skills/curate-skills/SKILL.md` - safe improvement workflow.
- Create: `skills/*/agents/openai.yaml` - Codex UI metadata.
- Create: `.claude-plugin/plugin.json` - Claude Code plugin manifest.
- Create: `.claude-plugin/marketplace.json` - Claude development marketplace.
- Create: `.codex-plugin/plugin.json` - Codex plugin manifest.
- Create: `.agents/plugins/marketplace.json` - Codex development marketplace.
- Create: `hooks/hooks.json` - Claude SessionStart registration.
- Create: `hooks/session-start.mjs` - Claude bootstrap output.
- Create: `test/**/*.test.ts` - unit and filesystem integration tests.
- Create: `scripts/validate-plugin.mjs` - repository-level manifest checks.
- Create: `README.md` - architecture, commands, and local install instructions.
- Create: `LICENSE` - MIT license.

## Task 1: Package and domain contracts

- [ ] **Step 1: Write failing CLI and type tests**

Create `test/cli/arguments.test.ts` with cases for `init`, `capture`, `validate`, `promote`, `rollback`, `status`, and `doctor`. Assert unknown flags fail and promotion requires at least one target.

```ts
test("parses a multi-target promotion", () => {
  assert.deepEqual(parseArguments(["promote", "cand-1", "--target", "claude,codex", "--yes"]), {
    command: "promote",
    candidateId: "cand-1",
    targets: ["claude", "codex"],
    scope: "project",
    yes: true,
    acceptWarnings: false,
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- test/cli/arguments.test.ts`

Expected: FAIL because `src/cli/arguments.ts` does not exist.

- [ ] **Step 3: Implement strict package and CLI contracts**

Define commands as a discriminated union in `src/domain/types.ts` and return that union from `parseArguments`. Keep parsing separate from command execution.

```ts
export type Command =
  | { command: "init"; root: string }
  | { command: "capture"; source: string; createdBy: "agent" | "human"; evidence: string[] }
  | { command: "validate"; candidateId: string }
  | { command: "promote"; candidateId: string; targets: TargetName[]; scope: Scope; yes: boolean; acceptWarnings: boolean }
  | { command: "rollback"; promotionId: string; yes: boolean; force: boolean }
  | { command: "status" }
  | { command: "doctor"; targets: TargetName[] };
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- test/cli/arguments.test.ts && npm run typecheck`

Expected: PASS with zero TypeScript errors.

## Task 2: Safe files, metadata, hashing, and scanner

- [ ] **Step 1: Write failing filesystem and scanner tests**

Create tests that reject missing `SKILL.md`, mismatched folder/name, invalid names, symlinks, files escaping the package, binary files, secret-like values, prompt override phrases, destructive shell, and persistence commands. Add a safe package fixture that passes.

```ts
test("rejects a symlink inside a candidate", async () => {
  const fixture = await createSkillFixture();
  await symlink("/etc/hosts", join(fixture, "references", "hosts"));
  await assert.rejects(() => validateSkillPackage(fixture), PathPolicyError);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- test/files test/skills test/security`

Expected: FAIL because validators and scanner do not exist.

- [ ] **Step 3: Implement deterministic traversal and metadata parsing**

`src/files/tree.ts` must use `lstat`, reject symbolic links and non-regular files, sort relative POSIX paths, enforce file and total-size limits, and never follow a path outside the candidate root.

`src/skills/frontmatter.ts` must accept only a top YAML fence with scalar `name` and `description`, normalize quoted values, and reject duplicate fields.

- [ ] **Step 4: Implement stable hashing and trust findings**

Hash each normalized relative path, a zero separator, file bytes, and another zero separator in sorted order. Scanner rules live in `src/security/patterns.ts`; orchestration lives in `src/security/scan.ts`.

```ts
export type TrustFinding = {
  ruleId: string;
  severity: "info" | "warning" | "danger";
  file: string;
  line: number;
  message: string;
};
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- test/files test/skills test/security && npm run typecheck`

Expected: PASS.

## Task 3: Resumable store and candidate capture

- [ ] **Step 1: Write failing store tests**

Cover initialization, idempotent initialization, exclusive lock acquisition, stale lock reporting, append-only sequence numbers, atomic candidate snapshots, invalid candidate cleanup, and secret redaction from events.

```ts
test("captures an immutable candidate and appends phases", async () => {
  const result = await captureCandidate(context, source, { createdBy: "agent", evidence: ["task:42"] });
  assert.equal(result.state, "captured");
  assert.deepEqual(readPhases(context, result.operationId), ["started", "validated", "snapshotted", "completed"]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- test/store test/commands/capture.test.ts`

Expected: FAIL because the store is missing.

- [ ] **Step 3: Implement layout, lock, journal, and stores**

Use `.skillloom/config.json`, `.skillloom/events.jsonl`, `.skillloom/candidates/`, `.skillloom/promotions/`, `.skillloom/backups/`, `.skillloom/staging/`, and `.skillloom/lock/`. Atomic JSON writes use a same-directory temporary file and rename. The journal opens with append mode and fsyncs before returning.

- [ ] **Step 4: Implement capture as orchestration**

Capture validates and scans before moving a snapshot into the candidate store. Candidate IDs combine UTC time and a content-hash prefix. Evidence is capped, trimmed, and stored without transcript contents.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- test/store test/commands/capture.test.ts && npm run typecheck`

Expected: PASS.

## Task 4: Harness adapters and transactional promotion

- [ ] **Step 1: Write failing adapter and transaction tests**

Use temporary HOME and repository directories. Assert exact Claude and Codex project/user paths. Test fresh install, replacement with backup, warning gate, danger block, staging failure, second-target commit failure compensation, base-hash mismatch, rollback, and rollback conflict.

```ts
test("compensates Claude when Codex commit fails", async () => {
  const result = await promoteCandidate(context, candidateId, failingSecondAdapterSet(), approval);
  assert.equal(result.status, "compensated");
  assert.equal(await pathExists(claudeDestination), false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- test/adapters test/promotions`

Expected: FAIL because adapters and promotion service do not exist.

- [ ] **Step 3: Implement adapters**

Adapters expose `resolveDestination`, `doctor`, and a stable target name. They do not copy files or own transaction state.

```ts
export interface HarnessAdapter {
  readonly name: TargetName;
  resolveDestination(context: AdapterContext, scope: Scope, skillName: string): string;
  doctor(context: AdapterContext): Promise<DoctorCheck[]>;
}
```

- [ ] **Step 4: Implement promotion transaction**

Validate candidate state and trust findings, require explicit approval, stage all copies, snapshot destinations, commit targets, and compensate in reverse order on failure. Record hashes and paths after each durable phase.

- [ ] **Step 5: Implement guarded rollback**

Rollback compares the active hash with the promotion's after-hash. Refuse conflicts unless `--force`, then restore the prior snapshot or remove a newly created destination.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- test/adapters test/promotions && npm run typecheck`

Expected: PASS.

## Task 5: CLI commands and behavior smoke tests

- [ ] **Step 1: Write failing command integration tests**

Spawn the built CLI in an isolated temporary repository. Assert JSON output schemas, human summaries, exit codes, and that `promote` without `--yes` makes no changes.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- test/cli/integration.test.ts`

Expected: FAIL because command handlers and binary wiring are incomplete.

- [ ] **Step 3: Implement command handlers and output**

Each file under `src/commands/` owns one workflow. `src/cli/main.ts` maps typed domain failures to stable non-zero exit codes and supports `--json` without duplicating domain logic.

- [ ] **Step 4: Build and run the complete lifecycle**

Run:

```bash
npm run build
node dist/cli/main.js init
node dist/cli/main.js capture test/fixtures/safe-skill --created-by agent --evidence task:smoke --json
node dist/cli/main.js status --json
```

Expected: build succeeds, init is idempotent, capture returns a candidate ID, and status reports it.

- [ ] **Step 5: Run CLI integration tests**

Run: `npm test -- test/cli/integration.test.ts && npm run typecheck`

Expected: PASS.

## Task 6: Cross-agent plugin packaging and workflow skills

- [ ] **Step 1: Scaffold the Codex plugin with official tooling**

Run the `plugin-creator` scaffold in a temporary directory with skills, hooks, scripts, and assets enabled. Copy only the validated manifest shape into the repo root and customize real metadata.

- [ ] **Step 2: Create the Claude and Codex manifests**

Both manifests use version `0.1.0`, repository `https://github.com/Chulinuwu/skillloom`, MIT license, and `skills/`. The Codex manifest intentionally omits `hooks` because the current official schema rejects the field, preventing Claude hooks from auto-loading; re-evaluate if that schema changes. The Claude manifest relies on conventional root discovery.

- [ ] **Step 3: Create focused workflow skills**

`capture-learning` triggers after a complex reusable workflow or an explicit learn request. `curate-skills` triggers when inspecting and improving Skillloom-managed skills. Both require validation, trust reporting, explicit promotion, and rollback evidence. They use action language, not harness tool names.

- [ ] **Step 4: Generate `agents/openai.yaml`**

Use `skill-creator/scripts/generate_openai_yaml.py` with deterministic interface values. Default prompts must mention `$capture-learning` and `$curate-skills` explicitly.

- [ ] **Step 5: Add Claude SessionStart bootstrap**

`hooks/session-start.mjs` reads the capture skill metadata and emits Claude's `hookSpecificOutput.additionalContext`. It must not emit the full skill catalog or change user files.

- [ ] **Step 6: Validate manifests and skills**

Run:

```bash
claude plugin validate .
python3 /Users/chulinxz/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
python3 /Users/chulinxz/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/capture-learning
python3 /Users/chulinxz/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/curate-skills
node scripts/validate-plugin.mjs
```

Expected: all validators pass.

## Task 7: Documentation, install smoke tests, and final quality gate

- [ ] **Step 1: Write README and license**

Document the safety boundary, architecture, lifecycle, CLI, state layout, Claude Code install, Codex install, generic adapter, development commands, and recovery behavior. Do not claim autonomous promotion or malware-proof scanning.

- [ ] **Step 2: Run full verification**

Run: `npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run validate:plugin`

Expected: all commands pass.

- [ ] **Step 3: Smoke-test Claude Code installation**

Add the repository's `.claude-plugin/marketplace.json` as a local marketplace, install `skillloom@skillloom-dev`, run `claude plugin details`, and validate the SessionStart hook output directly. Remove only the temporary marketplace/install state created by the test when the CLI supports a scoped uninstall.

- [ ] **Step 4: Smoke-test Codex installation**

Add the repository root as a local Codex marketplace, install `skillloom@skillloom-dev`, and confirm `codex plugin list --json` reports installed and enabled. Use a cachebuster version for repeat local iterations.

- [ ] **Step 5: Run AI slop cleanup and rerun verification**

Run the configured cleanup workflow on changed files only, then rerun the full verification command.

- [ ] **Step 6: Independent review and architecture invariant audit**

Require separate code-reviewer and architect evidence. Prove every invariant from the design spec with implementation, test output, and review evidence. Resolve all blocking findings before marking the aggregate goal complete.

## Plan self-review

- Spec coverage: all goals, non-goals, lifecycle phases, adapters, recovery rules, packaging, and tests map to tasks above.
- Placeholder scan: no `TBD`, deferred implementation marker, or unspecified error-handling step remains.
- Type consistency: command, candidate, finding, adapter, operation, and promotion names are stable across tasks.
- Scope: daemon, MCP server, cloud registry, LLM generation, and additional first-class harnesses remain outside this implementation.
