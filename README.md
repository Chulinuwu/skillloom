# Skillloom

Skillloom is a local-first lifecycle for portable Agent Skills. It captures a focused skill package as an immutable candidate, validates and scans it, promotes identical content through filesystem adapters, and records enough evidence to resume or roll back safely.

Skillloom does not run an LLM, own agent conversations, operate a daemon, or promote skills automatically.

## Safety boundary

Every candidate is structurally validated and scanned for deterministic risk patterns before promotion. Danger findings block promotion. Warning findings require both `--accept-warnings` and explicit promotion approval with `--yes`.

This scan is a preflight guard, not a malware-proof sandbox. Review skill instructions and executable resources before approving them. Do not store credentials or full conversation transcripts as evidence.

## Architecture and lifecycle

The TypeScript CLI owns the domain workflow. `src/skills` validates Agent Skill packages, `src/security` produces trust findings, `src/store` records append-only events and immutable candidates, `src/promotions` stages transactional copies and backups, and `src/adapters` resolves native discovery paths.

The lifecycle is:

1. Draft one harness-neutral skill package in a temporary directory.
2. Capture it with concise provenance.
3. Validate structure, references, hashes, and trust findings.
4. Review the candidate and choose destinations.
5. Promote only with explicit approval.
6. Verify destination hashes and reload the target harness.
7. Resume an interrupted transaction when recorded staging evidence agrees, or roll back from its promotion record.

Runtime state lives under `.skillloom/`: configuration, immutable candidates, append-only events, promotions, backups, staging data, and the mutation lock. Active destinations are not written before validation and scanning pass.

## Standalone CLI

Install the published package globally or run it through npm:

```bash
npm install --global skillloom
npx skillloom status
```

Initialize and capture a new candidate:

```bash
skillloom init
skillloom capture ./draft-skill --created-by agent --evidence task:123 --json
skillloom validate 20260717T120000Z-example123 --json
```

Capture an improvement with concurrent-edit protection:

```bash
skillloom capture ./revised-skill \
  --created-by agent \
  --base ./.agents/skills/example \
  --evidence issue:456
```

Promote to native project discovery paths only after review:

```bash
skillloom promote 20260717T120000Z-example123 \
  --target claude,codex,agents \
  --scope project \
  --yes
```

Warnings require a separate acknowledgement:

```bash
skillloom promote 20260717T120000Z-example123 \
  --target codex \
  --scope user \
  --yes \
  --accept-warnings
```

Use an explicit directory for the generic adapter:

```bash
skillloom promote 20260717T120000Z-example123 \
  --target generic \
  --destination /absolute/path/to/skills \
  --yes
```

Inspect and recover durable operations:

```bash
skillloom status --json
skillloom resume op-20260717-example --yes
skillloom rollback promotion-20260717-example --yes
skillloom recover-lock journal --yes
```

`resume` verifies recorded staged hashes before continuing. `rollback` verifies the active installed hash before restoring a backup. Use `rollback ... --force` only after reviewing a conflict where newer installed content would otherwise be protected. `recover-lock journal --yes` archives a confirmed stale journal lock; it does not silently discard lock evidence.

## Discovery and install paths

Skillloom ships one canonical `skills/` tree for every harness:

| Target | Project destination | User destination |
| --- | --- | --- |
| Claude Code adapter | `<project>/.claude/skills/<skill-name>` | `~/.claude/skills/<skill-name>` |
| Codex adapter | `<project>/.agents/skills/<skill-name>` | `~/.agents/skills/<skill-name>` |
| Agents adapter | `<project>/.agents/skills/<skill-name>` | `~/.agents/skills/<skill-name>` |
| Generic adapter | `<destination>/<skill-name>` | `<destination>/<skill-name>` |

Claude Code discovers `.claude-plugin/plugin.json`, root `skills/`, and `hooks/hooks.json`. Codex discovers `.codex-plugin/plugin.json` and root `skills/`; its development catalog is `.agents/plugins/marketplace.json`. Generic Agent Skills consumers can copy either skill directory directly to their supported skills path.

### Claude Code local development install

From the repository root:

```bash
claude plugin marketplace add .
claude plugin install skillloom@skillloom-dev --scope local
claude plugin details skillloom@skillloom-dev
```

Claude Code records the local marketplace from `.claude-plugin/marketplace.json`. Start a new session after installation or update so the skills and SessionStart hook are reloaded.

### Codex local development install

From the repository root:

```bash
codex plugin marketplace add .
codex plugin add skillloom@skillloom-dev
codex plugin list
```

Codex reads `.agents/plugins/marketplace.json` and `.codex-plugin/plugin.json`. Start a new task after installation or update so Codex reloads the skills. The Codex manifest deliberately omits Claude hooks because the current Codex plugin schema does not accept that field.

### Direct Agent Skills install

Without a plugin marketplace, copy the canonical skill directories to the consumer's Agent Skills path:

```bash
mkdir -p .agents/skills
cp -R skills/capture-learning skills/curate-skills .agents/skills/
```

Start a new session in the consuming harness after copying or updating skills.

## Development and verification

Requirements: Node.js 20 or newer, npm, and the Claude Code or Codex CLI only when validating those plugin formats.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run validate:plugin
npm pack
```

Additional manifest checks used by maintainers:

```bash
claude plugin validate .
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
python3 /path/to/skill-creator/scripts/quick_validate.py skills/capture-learning
python3 /path/to/skill-creator/scripts/quick_validate.py skills/curate-skills
```

The npm package allowlist contains `dist`, `skills`, `README.md`, and `LICENSE`. The `skillloom` binary resolves to `dist/cli/main.js`.
