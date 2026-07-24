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
};

const WINDOWS_DEFAULT_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"];

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
  if (runtime.platform !== "win32" || !environment.ProgramFiles) return {};
  return { tailscale: [win32.join(environment.ProgramFiles, "Tailscale", "tailscale.exe")] };
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
  const command = /\s/u.test(executable) ? `"${executable}"` : executable;
  return {
    executable: runtime.commandInterpreter,
    args: ["/d", "/s", "/c", command, ...args]
  };
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
