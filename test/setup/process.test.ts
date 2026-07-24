import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  executableCandidates,
  prepareProcessInvocation,
  type ExecutableRuntime
} from "../../src/setup/executable-resolution.js";
import { SystemProcessPort } from "../../src/setup/process.js";

const windowsRuntime: ExecutableRuntime = {
  platform: "win32",
  pathExt: ".EXE;.CMD",
  commandInterpreter: "C:\\Windows\\System32\\cmd.exe"
};

test("Windows executable discovery applies PATHEXT across every PATH entry", () => {
  assert.deepEqual(
    executableCandidates(
      "tailscale",
      "C:\\Tools;D:\\Agent Bin",
      { tailscale: ["C:\\Program Files\\Tailscale\\tailscale.exe"] },
      windowsRuntime
    ),
    [
      "C:\\Tools\\tailscale",
      "C:\\Tools\\tailscale.EXE",
      "C:\\Tools\\tailscale.CMD",
      "D:\\Agent Bin\\tailscale",
      "D:\\Agent Bin\\tailscale.EXE",
      "D:\\Agent Bin\\tailscale.CMD",
      "C:\\Program Files\\Tailscale\\tailscale.exe"
    ]
  );
});

test("Windows command shims run through cmd.exe while native executables remain direct", () => {
  assert.deepEqual(
    prepareProcessInvocation("C:\\Agent Bin\\claude.cmd", ["plugin", "list", "--json"], windowsRuntime),
    {
      executable: windowsRuntime.commandInterpreter,
      args: ["/d", "/s", "/c", "\"C:\\Agent Bin\\claude.cmd\"", "plugin", "list", "--json"]
    }
  );
  assert.deepEqual(
    prepareProcessInvocation("C:\\Program Files\\Tailscale\\tailscale.exe", ["status", "--json"], windowsRuntime),
    {
      executable: "C:\\Program Files\\Tailscale\\tailscale.exe",
      args: ["status", "--json"]
    }
  );
});

test("native Windows setup discovers and runs a command shim with spaced arguments", {
  skip: process.platform !== "win32"
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "skillloom command shim "));
  const executable = join(root, "skillloom-test.cmd");
  try {
    await writeFile(executable, "@echo off\r\n<nul set /p =%~1\r\n");
    const processes = new SystemProcessPort(root, {}, {
      platform: "win32",
      pathExt: ".CMD",
      commandInterpreter: process.env.ComSpec ?? "cmd.exe"
    });
    assert.equal(await processes.findExecutable("skillloom-test"), executable);
    assert.deepEqual(await processes.run(executable, ["value with spaces"]), {
      exitCode: 0,
      stdout: "value with spaces",
      stderr: ""
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
