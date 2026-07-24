import { posix, win32 } from "node:path";

export type ExecutableFallbacks = Readonly<Partial<Record<string, readonly string[]>>>;

export type ExecutableRuntime = {
  platform: NodeJS.Platform;
  pathExt: string;
  commandInterpreter: string;
};

export type ProcessInvocation = {
  executable: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
};

const WINDOWS_DEFAULT_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"];
const WINDOWS_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/gu;
const WINDOWS_NODE_MODULES_SHIM = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/iu;

export function defaultExecutableRuntime(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env
): ExecutableRuntime {
  return {
    platform,
    pathExt: environment.PATHEXT ?? WINDOWS_DEFAULT_EXTENSIONS.join(";"),
    commandInterpreter: environment.ComSpec ?? "cmd.exe"
  };
}

export function defaultExecutableFallbacks(
  runtime: ExecutableRuntime,
  environment: NodeJS.ProcessEnv = process.env
): ExecutableFallbacks {
  if (runtime.platform === "darwin") {
    return { tailscale: ["/Applications/Tailscale.app/Contents/MacOS/Tailscale"] };
  }
  if (runtime.platform !== "win32") return {};
  return {
    tailscale: compact([
      environment.ProgramFiles && win32.join(environment.ProgramFiles, "Tailscale", "tailscale.exe")
    ]),
    claude: compact([
      environment.USERPROFILE && win32.join(environment.USERPROFILE, ".local", "bin", "claude.exe"),
      environment.APPDATA && win32.join(environment.APPDATA, "npm", "claude.cmd"),
      environment.LOCALAPPDATA && win32.join(environment.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "claude.exe")
    ]),
    codex: compact([
      environment.APPDATA && win32.join(environment.APPDATA, "npm", "codex.cmd"),
      environment.LOCALAPPDATA && win32.join(environment.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "codex.exe")
    ])
  };
}

export function executableCandidates(
  name: string,
  searchPath: string,
  fallbacks: ExecutableFallbacks,
  runtime: ExecutableRuntime
): string[] {
  const path = runtime.platform === "win32" ? win32 : posix;
  const names = executableNames(name, runtime);
  const candidates = searchPath
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => names.map((candidate) => path.join(directory, candidate)));
  return uniquePaths([...candidates, ...fallbacks[name] ?? []], runtime.platform);
}

export function prepareProcessInvocation(
  executable: string,
  args: string[],
  runtime: ExecutableRuntime
): ProcessInvocation {
  const extension = win32.extname(executable).toLowerCase();
  if (runtime.platform !== "win32" || (extension !== ".cmd" && extension !== ".bat")) {
    return { executable, args };
  }
  const command = escapeWindowsCommand(win32.normalize(executable));
  const doubleEscapeMetaCharacters = WINDOWS_NODE_MODULES_SHIM.test(executable);
  const shellCommand = [
    command,
    ...args.map((argument) => escapeWindowsArgument(argument, doubleEscapeMetaCharacters))
  ].join(" ");
  return {
    executable: runtime.commandInterpreter,
    args: ["/d", "/s", "/c", `"${shellCommand}"`],
    windowsVerbatimArguments: true
  };
}

function escapeWindowsCommand(command: string): string {
  return command.replace(WINDOWS_META_CHARACTERS, "^$1");
}

function escapeWindowsArgument(argument: string, doubleEscapeMetaCharacters: boolean): string {
  let escaped = argument.replace(/(?=(\\+?)?)\1"/gu, "$1$1\\\"");
  escaped = escaped.replace(/(?=(\\+?)?)\1$/gu, "$1$1");
  escaped = `"${escaped}"`.replace(WINDOWS_META_CHARACTERS, "^$1");
  return doubleEscapeMetaCharacters
    ? escaped.replace(WINDOWS_META_CHARACTERS, "^$1")
    : escaped;
}

function executableNames(name: string, runtime: ExecutableRuntime): string[] {
  if (runtime.platform !== "win32" || win32.extname(name)) return [name];
  const extensions = runtime.pathExt
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean)
    .map((extension) => extension.startsWith(".") ? extension : `.${extension}`);
  return uniqueCaseInsensitive([name, ...extensions.map((extension) => `${name}${extension}`)]);
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniquePaths(paths: string[], platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [...new Set(paths)];
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compact(values: readonly (string | undefined)[]): string[] {
  return values.filter((value): value is string => value !== undefined);
}
