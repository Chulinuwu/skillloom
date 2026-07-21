import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { HarnessInstaller } from "../../src/setup/harness-installer.js";
import { PortableSkillInstaller } from "../../src/setup/portable-skills.js";
import type { ProcessPort, ProcessResult } from "../../src/setup/types.js";
import { tempDir } from "../helpers/fixtures.js";

type ExpectedRun = {
  executable: string;
  args: string[];
  result: ProcessResult;
};

const success = (stdout = ""): ProcessResult => ({ exitCode: 0, stdout, stderr: "" });

function processPort(expected: ExpectedRun[], executable = "/bin/claude"): ProcessPort {
  return {
    async findExecutable() {
      return executable;
    },
    async run(actualExecutable, actualArgs) {
      const next = expected.shift();
      assert.ok(next, `Unexpected process call: ${actualExecutable} ${actualArgs.join(" ")}`);
      assert.equal(actualExecutable, next.executable);
      assert.deepEqual(actualArgs, next.args);
      return next.result;
    }
  };
}

test("Claude installation registers the local marketplace and installs at the requested scope", async () => {
  for (const scope of ["user", "project"] as const) {
    const expected: ExpectedRun[] = [
      {
        executable: "/bin/claude",
        args: ["plugin", "marketplace", "add", "/tmp/a path", "--scope", scope],
        result: success()
      },
      {
        executable: "/bin/claude",
        args: ["plugin", "list", "--json"],
        result: success("[]")
      },
      {
        executable: "/bin/claude",
        args: ["plugin", "install", "skillloom@skillloom-dev", "--scope", scope],
        result: success()
      }
    ];
    const installer = new HarnessInstaller(processPort(expected));
    assert.deepEqual(await installer.install({
      target: "claude",
      scope,
      packageRoot: "/tmp/a path",
      destinationRoot: "/workspace"
    }), {
      target: "claude",
      status: "installed",
      message: "Skillloom plugin installed"
    });
    assert.deepEqual(expected, []);
  }
});

test("Claude installation is idempotent and re-enables a disabled scoped plugin", async () => {
  const enabled = JSON.stringify([{ id: "skillloom@skillloom-dev", scope: "user", enabled: true }]);
  const disabled = JSON.stringify([{ id: "skillloom@skillloom-dev", scope: "user", enabled: false }]);
  const expected: ExpectedRun[] = [
    { executable: "/bin/claude", args: ["plugin", "marketplace", "add", "/package", "--scope", "user"], result: success() },
    { executable: "/bin/claude", args: ["plugin", "list", "--json"], result: success(enabled) },
    { executable: "/bin/claude", args: ["plugin", "marketplace", "add", "/package", "--scope", "user"], result: success() },
    { executable: "/bin/claude", args: ["plugin", "list", "--json"], result: success(disabled) },
    { executable: "/bin/claude", args: ["plugin", "enable", "skillloom@skillloom-dev", "--scope", "user"], result: success() }
  ];
  const installer = new HarnessInstaller(processPort(expected));
  const request = { target: "claude" as const, scope: "user" as const, packageRoot: "/package", destinationRoot: "/home/user" };
  assert.equal((await installer.install(request)).status, "unchanged");
  assert.equal((await installer.install(request)).status, "installed");
  assert.deepEqual(expected, []);
});

test("Codex installation uses its marketplace add contract without an unsupported scope flag", async () => {
  const expected: ExpectedRun[] = [
    {
      executable: "/bin/codex",
      args: ["plugin", "marketplace", "add", "/tmp/a path", "--json"],
      result: success('{"marketplaceName":"skillloom-dev","alreadyAdded":false}')
    },
    {
      executable: "/bin/codex",
      args: ["plugin", "list", "--marketplace", "skillloom-dev", "--available", "--json"],
      result: success('{"installed":[],"available":[]}')
    },
    {
      executable: "/bin/codex",
      args: ["plugin", "add", "skillloom@skillloom-dev", "--json"],
      result: success()
    }
  ];
  const installer = new HarnessInstaller(processPort(expected, "/bin/codex"));
  assert.deepEqual(await installer.install({
    target: "codex",
    scope: "user",
    packageRoot: "/tmp/a path",
    destinationRoot: "/home/user"
  }), {
    target: "codex",
    status: "installed",
    message: "Skillloom plugin installed"
  });
  assert.deepEqual(expected, []);
});

test("Codex installation is idempotent and rejects unsupported project scope before mutation", async () => {
  const installed = JSON.stringify({
    installed: [{ pluginId: "skillloom@skillloom-dev", installed: true }],
    available: []
  });
  const expected: ExpectedRun[] = [
    { executable: "/bin/codex", args: ["plugin", "marketplace", "add", "/package", "--json"], result: success() },
    {
      executable: "/bin/codex",
      args: ["plugin", "list", "--marketplace", "skillloom-dev", "--available", "--json"],
      result: success(installed)
    }
  ];
  const installer = new HarnessInstaller(processPort(expected, "/bin/codex"));
  assert.equal((await installer.install({
    target: "codex",
    scope: "user",
    packageRoot: "/package",
    destinationRoot: "/home/user"
  })).status, "unchanged");
  assert.deepEqual(await installer.install({
    target: "codex",
    scope: "project",
    packageRoot: "/package",
    destinationRoot: "/workspace"
  }), {
    target: "codex",
    status: "failed",
    message: "Codex plugins support user scope only; use --scope user or --target agents --scope project"
  });
  assert.deepEqual(expected, []);
});

test("a partial Claude failure is reported and the install can resume safely", async () => {
  const expected: ExpectedRun[] = [
    { executable: "/bin/claude", args: ["plugin", "marketplace", "add", "/package", "--scope", "user"], result: success() },
    { executable: "/bin/claude", args: ["plugin", "list", "--json"], result: success("[]") },
    {
      executable: "/bin/claude",
      args: ["plugin", "install", "skillloom@skillloom-dev", "--scope", "user"],
      result: { exitCode: 2, stdout: "", stderr: "plugin rejected" }
    },
    { executable: "/bin/claude", args: ["plugin", "marketplace", "add", "/package", "--scope", "user"], result: success() },
    { executable: "/bin/claude", args: ["plugin", "list", "--json"], result: success("[]") },
    { executable: "/bin/claude", args: ["plugin", "install", "skillloom@skillloom-dev", "--scope", "user"], result: success() }
  ];
  const installer = new HarnessInstaller(processPort(expected));
  const request = { target: "claude" as const, scope: "user" as const, packageRoot: "/package", destinationRoot: "/home/user" };
  assert.deepEqual(await installer.install(request), {
    target: "claude",
    status: "failed",
    message: "plugin install failed: plugin rejected"
  });
  assert.equal((await installer.install(request)).status, "installed");
  assert.deepEqual(expected, []);
});

test("portable agents setup is local and does not invoke a process", async () => {
  const installer = new HarnessInstaller({
    async findExecutable() {
      throw new Error("unexpected executable lookup");
    },
    async run() {
      throw new Error("unexpected process invocation");
    }
  }, {
    async install() {
      return "unchanged";
    }
  });
  assert.equal(await installer.detect("agents"), true);
  assert.deepEqual(await installer.install({ target: "agents", scope: "project", packageRoot: "/package", destinationRoot: "/workspace" }), {
    target: "agents",
    status: "unchanged",
    message: "Portable Agent Skills are already installed"
  });
});

test("portable installation preserves unrelated Agent Skills and is idempotent", async () => {
  const packageRoot = await tempDir("skillloom-portable-package-");
  const destinationRoot = await tempDir("skillloom-portable-destination-");
  await mkdir(join(packageRoot, "skills", "skillloom-one"), { recursive: true });
  await writeFile(join(packageRoot, "skills", "skillloom-one", "SKILL.md"), "managed\n");
  await mkdir(join(destinationRoot, ".agents", "skills", "user-owned"), { recursive: true });
  await writeFile(join(destinationRoot, ".agents", "skills", "user-owned", "SKILL.md"), "keep\n");
  const installer = new PortableSkillInstaller();
  assert.equal(await installer.install(packageRoot, destinationRoot), "installed");
  assert.equal(await installer.install(packageRoot, destinationRoot), "unchanged");
  assert.equal(await readFile(join(destinationRoot, ".agents", "skills", "user-owned", "SKILL.md"), "utf8"), "keep\n");
  assert.equal(await readFile(join(destinationRoot, ".agents", "skills", "skillloom-one", "SKILL.md"), "utf8"), "managed\n");
});
