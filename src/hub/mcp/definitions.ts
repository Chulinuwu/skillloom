import type { BrainMcpToolDefinition } from "./types.js";

const artifactId = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" };
const requestId = { ...artifactId };
const artifactType = { type: "string", enum: ["note", "fact", "decision", "source", "project", "memory"] };
const sensitivity = { type: "string", enum: ["private", "tailnet", "restricted"] };
const jsonObject = { type: "object" };
const packageHash = { type: ["string", "null"], pattern: "^sha256-v2:[0-9a-f]{64}$" };
const capability = { type: "string", enum: ["filesystem-read", "filesystem-write", "network", "shell", "secrets"] };
const provenanceReference = {
  type: "object",
  properties: {
    artifactId: { type: "string", minLength: 1 },
    revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    contentHash: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" }
  },
  required: ["artifactId", "revision", "contentHash"],
  additionalProperties: false
};
const packageFile = {
  type: "object",
  properties: {
    relativePath: { type: "string", minLength: 1, maxLength: 500 },
    mode: { type: "integer", enum: [0o644, 0o755] },
    content: { type: "string", maxLength: 524_288 }
  },
  required: ["relativePath", "mode", "content"],
  additionalProperties: false
};

const definitions: readonly BrainMcpToolDefinition[] = [
  {
    name: "brain_search",
    description: "Search authorized second-brain artifacts.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1, maxLength: 500 }, type: artifactType, limit: { type: "integer", minimum: 1, maximum: 50 } },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "brain_read",
    description: "Read one authorized second-brain artifact.",
    inputSchema: { type: "object", properties: { artifactId }, required: ["artifactId"], additionalProperties: false }
  },
  {
    name: "brain_capture",
    description: "Capture a new second-brain artifact with an idempotent request ID.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        type: artifactType,
        title: { type: "string", minLength: 1, maxLength: 500 },
        content: { type: "string", maxLength: 2_000_000 },
        frontmatter: jsonObject,
        provenance: jsonObject,
        sensitivity
      },
      required: ["requestId", "type", "title", "content", "provenance", "sensitivity"],
      additionalProperties: false
    }
  },
  {
    name: "brain_update",
    description: "Update one second-brain artifact using optimistic revision control.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        artifactId,
        baseRevision: { type: "string", pattern: "^[1-9][0-9]*$" },
        type: artifactType,
        title: { type: "string", minLength: 1, maxLength: 500 },
        content: { type: "string", maxLength: 2_000_000 },
        frontmatter: jsonObject,
        provenance: jsonObject,
        sensitivity
      },
      required: ["requestId", "artifactId", "baseRevision"],
      additionalProperties: false
    }
  },
  {
    name: "brain_link",
    description: "Create a typed relationship between two second-brain artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        sourceArtifactId: artifactId,
        targetArtifactId: artifactId,
        relationship: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" }
      },
      required: ["requestId", "sourceArtifactId", "targetArtifactId", "relationship"],
      additionalProperties: false
    }
  },
  {
    name: "skill_releases",
    description: "List verified releases from the approved stable skill channel.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false
    }
  },
  {
    name: "skill_read",
    description: "Read one verified stable release with validation evidence and safe UTF-8 files.",
    inputSchema: {
      type: "object",
      properties: { releaseId: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["releaseId"],
      additionalProperties: false
    }
  },
  {
    name: "skill_propose",
    description: "Propose a validated portable skill package to the Hub registry.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        name: { type: "string", minLength: 1, maxLength: 200 },
        baseReleaseHash: packageHash,
        capabilities: { type: "array", items: capability, uniqueItems: true, maxItems: 5 },
        provenance: { type: "array", items: provenanceReference, maxItems: 16 },
        files: { type: "array", items: packageFile, minItems: 1, maxItems: 256 }
      },
      required: ["requestId", "name", "baseReleaseHash", "capabilities", "provenance", "files"],
      additionalProperties: false
    }
  },
  {
    name: "skill_publish",
    description: "Publish a validated registry candidate to the stable skill channel.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        candidateId: { type: "string", minLength: 1, maxLength: 200 },
        version: { type: "string", pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$" },
        channel: { type: "string", enum: ["stable"] }
      },
      required: ["requestId", "candidateId", "version", "channel"],
      additionalProperties: false
    }
  }
];

export function listBrainMcpTools(): readonly BrainMcpToolDefinition[] {
  return definitions;
}
