#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const repository = "https://github.com/Chulinuwu/skillloom";
const skillNames = ["autonomous-learning", "capture-learning", "curate-skills", "setup-skillloom"];

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function json(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function filesUnder(path) {
  const absolute = join(root, path);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(child));
    } else {
      files.push(child);
    }
  }
  return files;
}

function frontmatter(source) {
  const block = source.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  invariant(block, "SKILL.md must start with YAML frontmatter");
  const values = new Map();
  for (const line of block.split("\n")) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/u);
    if (match) {
      values.set(match[1], match[2].trim());
    }
  }
  return values;
}

async function validateManifests() {
  const packageJson = await json("package.json");
  const packageLock = await json("package-lock.json");
  const claude = await json(".claude-plugin/plugin.json");
  const codex = await json(".codex-plugin/plugin.json");
  const mcp = await json(".mcp.json");
  const claudeMarketplace = await json(".claude-plugin/marketplace.json");
  const codexMarketplace = await json(".agents/plugins/marketplace.json");
  const ci = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");
  const version = packageJson.version;

  invariant(version === "0.3.0", "package version must be 0.3.0");
  invariant(packageLock.version === version && packageLock.packages?.[""]?.version === version, "package-lock version must match package.json");
  invariant(packageJson.engines?.node === ">=22.16.0", "package Node.js runtime floor must be 22.16.0");
  invariant(/node:\s*\["22\.16\.0", 24, 26\]/u.test(ci), "CI must test the runtime floor and supported Node.js releases");
  invariant(readme.includes("Node.js 22.16 or newer") && readme.includes("Node.js 22.16, 24, and 26"), "README runtime requirements must match package and CI contracts");
  invariant(packageJson.bin?.skillloom === "dist/cli/main.js", "package bin must expose dist/cli/main.js");
  invariant(/private second brain/iu.test(packageJson.description), "package description must position Skillloom as a private second brain");
  invariant(claude.version === version && codex.version === version, "plugin versions must match package.json");
  invariant(claudeMarketplace.plugins?.[0]?.version === version, "Claude marketplace version must match package.json");
  invariant(claude.name === "skillloom" && codex.name === "skillloom", "plugin names must be skillloom");
  invariant(/private second brain/iu.test(claude.description) && /private second brain/iu.test(codex.description), "plugin descriptions must position Skillloom as a private second brain");
  invariant(/private second brain/iu.test(codex.interface.shortDescription), "Codex About short description must position Skillloom as a private second brain");
  invariant(/human knowledge/iu.test(codex.interface.longDescription) && /Obsidian/iu.test(codex.interface.longDescription), "Codex About long description must cover unified Brain and Obsidian");
  invariant(claude.repository === repository && codex.repository === repository, "plugin repositories must match the public repository");
  invariant(claude.license === "MIT" && codex.license === "MIT" && packageJson.license === "MIT", "all packages must use MIT");
  invariant(!("skills" in claude) && !("hooks" in claude), "Claude manifest must use conventional root discovery");
  invariant(codex.skills === "./skills/", "Codex manifest must declare the shared skills root");
  invariant(codex.mcpServers === "./.mcp.json", "Codex manifest must reference the root MCP configuration");
  invariant(JSON.stringify(mcp) === JSON.stringify({
  mcpServers: { skillloom: { command: "node", args: ["dist/cli/main.js", "bridge", "--stdio"], cwd: "." } }
  }), "MCP configuration must use the local zero-secret stdio bridge");
  invariant(!("hooks" in codex), "Codex manifest must omit the currently unsupported hooks field");
  invariant(claudeMarketplace.name === "skillloom-dev" && claudeMarketplace.plugins?.[0]?.source === "./", "Claude development marketplace must use source ./");
  invariant(codexMarketplace.name === "skillloom-dev", "Codex development marketplace name must be skillloom-dev");
  invariant(codexMarketplace.plugins?.[0]?.source?.source === "url" && codexMarketplace.plugins?.[0]?.source?.url === "./", "Codex development marketplace must use source ./");
  invariant(codexMarketplace.plugins?.[0]?.policy?.installation === "AVAILABLE", "Codex plugin must be available for installation");
  invariant(codexMarketplace.plugins?.[0]?.policy?.authentication === "ON_INSTALL", "Codex plugin must declare installation authentication policy");

  for (const prompt of codex.interface?.defaultPrompt ?? []) {
    invariant(prompt.length <= 128, "Codex default prompts must not exceed 128 characters");
  }
  invariant(codex.interface.defaultPrompt.some((prompt) => prompt.includes("$capture-learning")), "Codex prompts must mention $capture-learning");
  invariant(codex.interface.defaultPrompt.some((prompt) => prompt.includes("$curate-skills")), "Codex prompts must mention $curate-skills");
  invariant(codex.interface.defaultPrompt.some((prompt) => prompt.includes("$autonomous-learning")), "Codex prompts must mention $autonomous-learning");
  invariant(codex.interface.defaultPrompt.some((prompt) => prompt.includes("lifecycle review is invoked")), "Codex prompts must report lifecycle review as invoked");
}

async function validateSkills() {
  const directories = (await readdir(join(root, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  invariant(JSON.stringify(directories) === JSON.stringify(skillNames), "Claude and Codex must discover the same skill directories");

  for (const name of skillNames) {
    const source = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
    const metadata = frontmatter(source);
    const openai = await readFile(join(root, "skills", name, "agents", "openai.yaml"), "utf8");
    invariant(metadata.get("name") === name, `${name} frontmatter name must match its directory`);
    invariant((metadata.get("description")?.length ?? 0) >= 120, `${name} needs a trigger-rich description`);
    invariant(openai.includes(`$${name}`), `${name} default prompt must explicitly mention the skill`);
    if (name === "setup-skillloom") {
      invariant(/Ask at most one role question/iu.test(source), `${name} must be role-first before setup side effects`);
      invariant(/Main Hub/iu.test(source) && /Client Node/iu.test(source) && /This Machine Only/iu.test(source), `${name} must teach the three setup roles`);
      invariant(/dynamic guidance sources/iu.test(source) && /allowlisted official docs or installed CLI help/iu.test(source), `${name} must rely on runtime guidance for external setup steps`);
      invariant(/Never ask[\s\S]*Tailscale auth key[\s\S]*into chat/iu.test(source), `${name} must protect Tailscale credentials without requiring a literal variable name`);
      invariant(/Do not teach a default auth-key, sidecar, or Tailscale Service setup/iu.test(source), `${name} must not teach default auth-key, sidecar, or service setup`);
      invariant(/Auth keys and `svc:\*` Services are advanced/iu.test(source), `${name} must keep auth keys and service aliases advanced-only`);
      invariant(/private Tailscale Serve from the host Tailscale session/iu.test(source), `${name} must teach private host Serve as the default main Hub path`);
      invariant(/For Main Hub, run the single setup flow/iu.test(source) && /combined consent/iu.test(source), `${name} must teach one-flow Main Hub setup`);
      invariant(!/```sh\n([^`]|`(?!``))*host install/iu.test(source), `${name} must not put host install in the default Main Hub command block`);
      invariant(/host install` only for advanced\/manual recovery/iu.test(source), `${name} must keep host install as advanced or manual recovery only`);
      invariant(/host identity/iu.test(source) && /HTTPS port 8443/iu.test(source) && /read-only/iu.test(source), `${name} must preserve the private Obsidian boundary`);
      invariant(/not from guessed hostnames/iu.test(source), `${name} must report generated setup URLs instead of hardcoding them`);
    } else {
      invariant(/validat/iu.test(source) && /scan|finding/iu.test(source), `${name} must require validation and scan evidence`);
      invariant(/rollback/iu.test(source) && /evidence|hash/iu.test(source), `${name} must preserve rollback evidence`);
    }
    if (name === "autonomous-learning") {
      invariant(/policy/iu.test(source) && /quarantin/iu.test(source) && /observe/iu.test(source), `${name} must enforce policy-gated learning evidence`);
      invariant(/brain_search/u.test(source) && /brain_capture/u.test(source) && /brain_update/u.test(source) && /brain_link/u.test(source), `${name} must define search-before-write Brain curation`);
      invariant(/at most one successful central Brain mutation/iu.test(source) && /central curation did not succeed/iu.test(source), `${name} must bound central mutations and prevent false success`);
    } else if (name !== "setup-skillloom") {
      invariant(/approval/iu.test(source) && /promot/iu.test(source), `${name} must require explicit promotion approval`);
      invariant(/never promote autonomously/iu.test(source), `${name} must prohibit autonomous promotion`);
      invariant(!/Claude Code|Codex|MCP tool|computer use/iu.test(source), `${name} must remain harness-neutral`);
    }
  }
}

async function validateHook() {
  const config = await readFile(join(root, "hooks", "config.mjs"), "utf8");
  const source = await readFile(join(root, "hooks", "session-start.mjs"), "utf8");
  const stop = await readFile(join(root, "hooks", "stop.mjs"), "utf8");
  const hookConfig = await readFile(join(root, "hooks", "hooks.json"), "utf8");
  const forbidden = [/fetch\s*\(/u, /https?:\/\//u, /writeFile|appendFile|rename|unlink|\brm\b/u, /execFile|spawn/u];
  const stopForbidden = [/fetch\s*\(/u, /https?:\/\//u, /appendFile|rename|unlink|\brm\b/u, /execFile|spawn/u];
  invariant(config.includes('../mode-profile.mjs') && !config.includes("../dist/"), "Hooks must use the build-independent canonical mode profile");
  invariant(source.includes("readFile(skillPath"), "SessionStart must read capture metadata locally");
  invariant(forbidden.every((pattern) => !pattern.test(source)), "SessionStart must not mutate files or use network/process adapters");
  invariant(stopForbidden.every((pattern) => !pattern.test(stop)), "Stop must not use network/process/destructive adapters");
  invariant(stop.includes("\".skillloom\"") && stop.includes("\"learning\"") && stop.includes("writeJsonIfAbsent"), "Stop may only create bounded local learning checkpoints");
  invariant(stop.includes("{ flag: \"wx\"") && stop.includes("0o600"), "Stop learning checkpoints must be create-once and private");
  invariant(hookConfig.includes('"SessionStart"') && hookConfig.includes('"Stop"'), "Plugin hooks must declare SessionStart and Stop");
  invariant(stop.includes("stop_hook_active") && stop.includes("$autonomous-learning"), "Stop must prevent review loops and request autonomous-learning");
  invariant(stop.includes("exactly one bounded outcome") && stop.includes("do not claim a central write succeeded"), "Stop must request bounded curation without false central-write claims");

  const { stdout, stderr } = await execute(process.execPath, [join(root, "hooks", "session-start.mjs")], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root }
  });
  invariant(stderr === "", "SessionStart must not write diagnostics to stderr");
  const output = JSON.parse(stdout);
  invariant(JSON.stringify(Object.keys(output)) === JSON.stringify(["hookSpecificOutput"]), "SessionStart must emit only hookSpecificOutput");
  invariant(output.hookSpecificOutput?.hookEventName === "SessionStart", "SessionStart output must name its event");
  const context = output.hookSpecificOutput?.additionalContext;
  invariant(typeof context === "string" && context.length > 0 && context.length <= 500, "SessionStart additionalContext must be small");
  invariant(context.includes("$capture-learning") && context.includes("manual mode"), "SessionStart must default to a manual capture context");
  const fixture = await mkdtemp(join(tmpdir(), "skillloom-validate-hermes-"));
  try {
    await mkdir(join(fixture, ".skillloom"));
    await writeFile(join(fixture, ".skillloom", "config.json"), JSON.stringify({ mode: "hermes", hermes: { minToolCalls: 3 } }));
    const hermes = await execute(process.execPath, [join(root, "hooks", "session-start.mjs")], {
      cwd: fixture,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: root }
    });
    invariant(hermes.stderr === "", "Hermes SessionStart must not write diagnostics to stderr");
    const hermesContext = JSON.parse(hermes.stdout).hookSpecificOutput?.additionalContext;
    invariant(typeof hermesContext === "string" && hermesContext.length <= 500, "Hermes SessionStart must stay within the 500-character budget");
    invariant(["bounded Brain recall", "high-confidence", "Continue if Hub unavailable"].every((phrase) => hermesContext.includes(phrase)), "Hermes SessionStart must request bounded recall and safe Hub fallback");
    invariant(hermesContext.includes("Codex and agents require invocation"), "Hermes SessionStart must report unsupported host lifecycle degradation");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function validateFiles() {
  for (const path of [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
    ".mcp.json",
    ".agents/plugins/marketplace.json",
    "hooks/hooks.json",
    "hooks/session-start.mjs",
    "hooks/stop.mjs",
    "mode-profile.d.mts",
    "mode-profile.mjs",
    "README.md",
    "LICENSE"
  ]) {
    await access(join(root, path));
  }

  const paths = [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
    ".mcp.json",
    ".agents/plugins/marketplace.json",
    "README.md",
    "test/packaging/validate-plugin.mjs",
    ...await filesUnder("hooks"),
    ...await filesUnder("skills")
  ];
  const bannedTokens = ["[" + "TODO", "T" + "BD", "PLACE" + "HOLDER"];
  for (const path of paths) {
    const stat = await lstat(join(root, path));
    invariant(stat.isFile(), `${relative(root, join(root, path))} must be a regular file`);
    const source = await readFile(join(root, path), "utf8");
    invariant(bannedTokens.every((token) => !source.toUpperCase().includes(token)), `${path} contains unfinished scaffold text`);
  }
}

await validateManifests();
await validateSkills();
await validateHook();
await validateFiles();
process.stdout.write("Skillloom plugin validation passed.\n");
