import { createHash } from "node:crypto";
import type { ProcessPort, SetupGuidanceSource } from "./types.js";

type OfficialDoc = {
  title: string;
  url: string;
};
type FetchTextPort = (url: string) => Promise<{ body: string; fetchedAt: string }>;

const OFFICIAL_DOCS: OfficialDoc[] = [
  { title: "Tailscale Serve", url: "https://tailscale.com/docs/features/tailscale-serve" },
  { title: "Tailscale serve command", url: "https://tailscale.com/docs/reference/tailscale-cli/serve" },
  { title: "Tailscale Services", url: "https://tailscale.com/docs/features/tailscale-services" },
  { title: "Docker Compose install", url: "https://docs.docker.com/compose/install/" }
];

const ALLOWED_HOSTS = new Set(["tailscale.com", "docs.docker.com"]);

export class DynamicSetupGuidanceSources {
  constructor(private readonly processes: ProcessPort, private readonly fetchText?: FetchTextPort) {}

  async collect(): Promise<SetupGuidanceSource[]> {
    const docs = await Promise.all(OFFICIAL_DOCS.map(async (doc) => await this.fetchOfficialDoc(doc)));
    const found = docs.filter((source): source is SetupGuidanceSource => source !== null);
    if (found.length > 0) return found;
    return await this.collectCliHelp();
  }

  private async fetchOfficialDoc(doc: OfficialDoc): Promise<SetupGuidanceSource | null> {
    if (!ALLOWED_HOSTS.has(new URL(doc.url).hostname)) return null;
    try {
      const { body, fetchedAt } = await this.retrieveDoc(doc.url);
      return {
        kind: "official-doc",
        title: doc.title,
        url: doc.url,
        fetchedAt,
        ...pageDate(body),
        contentHash: hash(body),
        snippets: snippets(body)
      };
    } catch {
      return null;
    }
  }

  private async retrieveDoc(url: string): Promise<{ body: string; fetchedAt: string }> {
    if (this.fetchText) return await this.fetchText(url);
    const curl = await this.processes.findExecutable("curl");
    if (!curl) throw new Error("curl unavailable");
    const fetchedAt = new Date().toISOString();
    const response = await this.processes.run(curl, ["--fail", "--silent", "--show-error", "--location", "--max-time", "3", "--proto", "=https", url]);
    if (response.exitCode !== 0) throw new Error(response.stderr || `curl exited ${response.exitCode}`);
    return { body: response.stdout, fetchedAt };
  }

  private async collectCliHelp(): Promise<SetupGuidanceSource[]> {
    const sources: SetupGuidanceSource[] = [];
    const fetchedAt = new Date().toISOString();
    const tailscale = await this.processes.findExecutable("tailscale");
    if (tailscale) {
      const help = await this.processes.run(tailscale, ["serve", "--help"]);
      if (help.exitCode === 0) {
        sources.push({ kind: "cli-help", title: "tailscale serve --help", fetchedAt, contentHash: hash(help.stdout), snippets: snippets(help.stdout) });
      }
    }
    const docker = await this.processes.findExecutable("docker");
    if (docker) {
      const help = await this.processes.run(docker, ["compose", "--help"]);
      if (help.exitCode === 0) {
        sources.push({ kind: "cli-help", title: "docker compose --help", fetchedAt, contentHash: hash(help.stdout), snippets: snippets(help.stdout) });
      }
    }
    return sources;
  }
}

function pageDate(body: string): { pageDate?: string } {
  const match = body.match(/(?:Published|Last validated):\s*([^<|\n]+)/iu);
  return match?.[1] ? { pageDate: match[1].trim() } : {};
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("base64url")}`;
}

function snippets(body: string): string[] {
  const matches = body
    .split(/\r?\n/u)
    .map((line) => sanitizeSnippet(line))
    .filter((line) => !/\bfunnel\b/iu.test(line))
    .filter((line) => /(serve|service|compose|docker|login|auth|tailscale)/iu.test(line))
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.slice(0, 180));
  return matches.length > 0 ? matches : [sanitizeSnippet(body)].filter(Boolean);
}

function sanitizeSnippet(line: string): string {
  return line
    .replace(/\bTS_AUTHKEY\s*=\s*\S+/gu, "TS_AUTHKEY=<redacted>")
    .replace(/tskey-[A-Za-z0-9_-]+/gu, "tskey-<redacted>")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
}
