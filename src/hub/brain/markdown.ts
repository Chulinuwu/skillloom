import { BrainStorageCorruptionError } from "./errors.js";
import { hashBrainContent } from "./hash.js";
import type { BrainArtifact } from "./types.js";
import { parseBrainArtifact } from "./validation.js";

const delimiter = "---\n";

export function serializeBrainMarkdown(artifact: BrainArtifact): string {
  const { content, ...metadata } = artifact;
  return `${delimiter}${JSON.stringify(metadata)}\n${delimiter}${content}`;
}

export function parseBrainMarkdown(text: string): BrainArtifact | null {
  if (!text.startsWith(delimiter)) {
    return null;
  }
  const end = text.indexOf(`\n${delimiter}`, delimiter.length);
  if (end === -1) {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter is unterminated");
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(text.slice(delimiter.length, end));
  } catch {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter is malformed");
  }
  const content = text.slice(end + delimiter.length + 1);
  const artifact = parseBrainArtifact({ ...recordMetadata(metadata), content });
  return { ...artifact, contentHash: hashBrainContent(content) };
}

function recordMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BrainStorageCorruptionError("Brain Markdown frontmatter must be an object");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
