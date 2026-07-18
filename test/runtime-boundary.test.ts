import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import * as ts from "typescript";
import { createSkillFixture, tempDir } from "./helpers/fixtures.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const builtCli = join(repositoryRoot, "dist", "cli", "main.js");
const productionRoot = join(repositoryRoot, "src");
const providerEnvironmentVariables = [
  "ANTHROPIC_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "COHERE_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
  "HF_TOKEN",
  "HUGGINGFACEHUB_API_TOKEN",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "TOGETHER_API_KEY",
  "XAI_API_KEY"
] as const;
const forbiddenBuiltinModules = new Set([
  "node:child_process",
  "node:cluster",
  "node:dgram",
  "node:dns",
  "node:dns/promises",
  "node:http",
  "node:http2",
  "node:https",
  "node:net",
  "node:tls",
  "node:worker_threads"
]);

test("published runtime has an empty production dependency closure", async () => {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const lockfile = JSON.parse(await readFile(join(repositoryRoot, "package-lock.json"), "utf8"));
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies"]) {
    assert.equal(manifest[field], undefined, `${field} must stay empty`);
    assert.equal(lockfile.packages[""][field], undefined, `lockfile root ${field} must stay empty`);
  }
  const productionPackages = Object.entries(lockfile.packages)
    .filter(([path, metadata]) => path !== "" && !(metadata as { dev?: boolean }).dev)
    .map(([path]) => path);
  assert.deepEqual(productionPackages, []);
  assert.equal(manifest.scripts.lint, "eslint .");
  assert.equal(manifest.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
});

test("production dependency graph excludes network, provider, and background-service APIs", async () => {
  const violations: string[] = [];
  for (const path of await sourceFiles(productionRoot)) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const displayPath = relative(repositoryRoot, path);
    visit(source, (node) => {
      const moduleName = importedModule(node);
      if (moduleName) {
        if (forbiddenBuiltinModules.has(moduleName)) {
          violations.push(`${displayPath}:${line(source, node)} imports ${moduleName}`);
        } else if (!moduleName.startsWith("node:") && !moduleName.startsWith("./") && !moduleName.startsWith("../")) {
          violations.push(`${displayPath}:${line(source, node)} imports external runtime package ${moduleName}`);
        }
      }
      if (ts.isCallExpression(node) && callName(node.expression) === "fetch") {
        violations.push(`${displayPath}:${line(source, node)} invokes fetch`);
      }
      if (ts.isCallExpression(node) && isBackgroundRuntimeCall(node.expression)) {
        violations.push(`${displayPath}:${line(source, node)} starts background-capable work with ${callName(node.expression)}`);
      }
      if (ts.isNewExpression(node) && ["WebSocket", "EventSource", "Worker", "Command"].includes(callName(node.expression) ?? "")) {
        violations.push(`${displayPath}:${line(source, node)} creates ${callName(node.expression)}`);
      }
    });
  }
  assert.deepEqual(violations, []);
});

test("production runtime does not read provider credential environment variables", async () => {
  const forbidden = new Set<string>(providerEnvironmentVariables);
  const reads: string[] = [];
  for (const path of await sourceFiles(productionRoot)) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    visit(source, (node) => {
      for (const name of environmentReads(node)) {
        if (forbidden.has(name)) {
          reads.push(`${relative(repositoryRoot, path)}:${line(source, node)} reads ${name}`);
        }
      }
    });
  }
  assert.deepEqual(reads, []);
});

test("built CLI completes local generic and .agents lifecycles with empty PATH", async () => {
  const sandbox = await tempDir("skillloom-local-runtime-");
  const projectRoot = join(sandbox, "project");
  const homeDir = join(sandbox, "home");
  const source = await createSkillFixture(join(sandbox, "input", "safe-skill"));
  const sourceBefore = await packageSnapshot(source);
  await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(homeDir, { recursive: true })]);
  const environment = isolatedEnvironment(sandbox, homeDir);

  await runCli(projectRoot, environment, ["init", "--json"]);
  const candidate = JSON.parse((await runCli(projectRoot, environment, ["capture", source, "--json"])).stdout);
  const validation = JSON.parse((await runCli(projectRoot, environment, ["validate", candidate.candidateId, "--json"])).stdout);
  assert.equal(validation.state, "validated");

  const generic = JSON.parse((await runCli(projectRoot, environment, [
    "promote", candidate.candidateId, "--target", "generic", "--destination", "portable-skills", "--yes", "--json"
  ])).stdout);
  assert.equal(generic.result, "applied");
  assert.deepEqual(await packageSnapshot(join(projectRoot, "portable-skills", "safe-skill")), sourceBefore);
  assert.equal(JSON.parse((await runCli(projectRoot, environment, ["resume", generic.operationId, "--yes", "--json"])).stdout).result, "applied");
  const genericRollback = JSON.parse((await runCli(projectRoot, environment, ["rollback", generic.promotionId, "--yes", "--json"])).stdout);
  assert.equal(genericRollback.result, "rolled-back");
  assert.equal(JSON.parse((await runCli(projectRoot, environment, ["resume", genericRollback.rollbackOperationId, "--yes", "--json"])).stdout).result, "rolled-back");

  const agents = JSON.parse((await runCli(projectRoot, environment, [
    "promote", candidate.candidateId, "--target", "agents", "--scope", "project", "--yes", "--json"
  ])).stdout);
  assert.equal(agents.result, "applied");
  assert.deepEqual(await packageSnapshot(join(projectRoot, ".agents", "skills", "safe-skill")), sourceBefore);
  const agentsRollback = JSON.parse((await runCli(projectRoot, environment, ["rollback", agents.promotionId, "--yes", "--json"])).stdout);
  assert.equal(agentsRollback.result, "rolled-back");

  const statusReport = JSON.parse((await runCli(projectRoot, environment, ["status", "--json"])).stdout);
  assert.ok(statusReport.candidates.some((item: { candidateId: string }) => item.candidateId === candidate.candidateId));
  const doctor = JSON.parse((await runCli(projectRoot, environment, ["doctor", "--target", "claude,codex", "--json"])).stdout);
  const runtimeChecks = doctor.checks.filter((check: { kind: string }) => check.kind === "runtime");
  assert.equal(runtimeChecks.length, 2);
  assert.ok(runtimeChecks.every((check: { status: string }) => check.status === "warning"));

  assert.deepEqual(await packageSnapshot(source), sourceBefore);
  assert.deepEqual(await readdir(homeDir), []);
  assert.deepEqual((await readdir(sandbox)).sort(), ["home", "input", "project"]);
});

async function runCli(projectRoot: string, env: NodeJS.ProcessEnv, args: string[]) {
  return await execFileAsync(process.execPath, [builtCli, ...args], { cwd: projectRoot, env });
}

function isolatedEnvironment(sandbox: string, homeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: homeDir,
    PATH: "",
    TMPDIR: join(sandbox, "tmp"),
    XDG_CACHE_HOME: join(sandbox, "xdg-cache"),
    XDG_CONFIG_HOME: join(sandbox, "xdg-config"),
    XDG_STATE_HOME: join(sandbox, "xdg-state"),
    CLAUDE_CONFIG_DIR: join(sandbox, "claude-config"),
    CODEX_HOME: join(sandbox, "codex-home")
  };
  for (const name of providerEnvironmentVariables) {
    env[name] = "must-not-be-read";
  }
  return env;
}

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

function visit(node: ts.Node, inspect: (node: ts.Node) => void): void {
  inspect(node);
  node.forEachChild((child) => visit(child, inspect));
}

function importedModule(node: ts.Node): string | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
    return node.moduleReference.expression.text;
  }
  if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
    const [argument] = node.arguments;
    return argument && ts.isStringLiteral(argument) ? argument.text : undefined;
  }
  return undefined;
}

function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

function isBackgroundRuntimeCall(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === "setInterval";
  }
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "Bun"
    && expression.name.text === "spawn";
}

function environmentReads(node: ts.Node): string[] {
  if (ts.isPropertyAccessExpression(node) && isProcessEnvironment(node.expression)) {
    return [node.name.text];
  }
  if (ts.isElementAccessExpression(node) && isProcessEnvironment(node.expression) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return [node.argumentExpression.text];
  }
  if (ts.isVariableDeclaration(node) && node.initializer && isProcessEnvironment(node.initializer) && ts.isObjectBindingPattern(node.name)) {
    return node.name.elements.flatMap((element) => {
      const property = element.propertyName ?? element.name;
      return ts.isIdentifier(property) || ts.isStringLiteral(property) ? [property.text] : [];
    });
  }
  return [];
}

function isProcessEnvironment(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "process"
    && node.name.text === "env";
}

function line(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

async function packageSnapshot(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const path of await packageFiles(root)) {
    const relativePath = relative(root, path).split("\\").join("/");
    snapshot[relativePath] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
  return snapshot;
}

async function packageFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await packageFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}
