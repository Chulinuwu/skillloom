import { brainArtifactLayers, brainArtifactTypes } from "../brain/vocabulary.js";
import type { BrainMcpToolDefinition } from "./types.js";

const artifactId = { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" };
const requestId = { ...artifactId };
const artifactType = { type: "string", enum: brainArtifactTypes };
const artifactLayer = { type: "string", enum: brainArtifactLayers };
const sensitivity = { type: "string", enum: ["private", "tailnet", "restricted"] };
const jsonObject = { type: "object" };
const semanticValue = {};
const artifactDetails = {
  anyOf: [
    { type: "object", properties: { kind: { type: "string", enum: ["none"] } }, required: ["kind"], additionalProperties: false },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["knowledge"] },
        status: { type: "string", enum: ["draft", "accepted", "disputed", "superseded"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        entities: { type: "array", items: { type: "string" } },
        concepts: { type: "array", items: { type: "string" } }
      },
      required: ["kind", "status"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["episode"] },
        taskId: { type: "string", minLength: 1 },
        hostId: { type: "string", minLength: 1 },
        startedAt: { type: "string" },
        endedAt: { type: "string" },
        outcome: { type: "string", enum: ["success", "failure", "partial", "cancelled"] }
      },
      required: ["kind", "taskId", "hostId", "startedAt", "outcome"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["workflow"] },
        trigger: { type: "string", minLength: 1 },
        steps: { type: "array", items: { type: "string" } },
        verifier: { type: "string", minLength: 1 },
        promotable: { type: "boolean" }
      },
      required: ["kind", "trigger", "steps", "promotable"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["feedback"] },
        targetArtifactId: { type: "string", minLength: 1 },
        signal: { type: "string", enum: ["positive", "negative", "correction"] },
        reason: { type: "string", minLength: 1 }
      },
      required: ["kind", "targetArtifactId", "signal", "reason"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["rejected-update"] },
        targetArtifactId: { type: "string", minLength: 1 },
        rejectedAt: { type: "string" },
        reason: { type: "string", minLength: 1 },
        retryable: { type: "boolean" }
      },
      required: ["kind", "targetArtifactId", "rejectedAt", "reason", "retryable"],
      additionalProperties: false
    }
  ]
};
const packageHash = { type: ["string", "null"], pattern: "^sha256-v2:[0-9a-f]{64}$" };
const packageHashString = { type: "string", pattern: "^sha256-v2:[0-9a-f]{64}$" };
const sha256Digest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
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
const workflowProof = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["skillloom-workflow-proof-v1"] },
    decisionId: { type: "string", minLength: 1 },
    idempotencyKey: { type: "string", minLength: 1 },
    verdict: { type: "string", enum: ["passed", "failed"] },
    workflow: {
      type: "object",
      properties: {
        artifactId: { type: "string", minLength: 1 },
        revision: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
        contentHash: sha256Digest
      },
      required: ["artifactId", "revision", "contentHash"],
      additionalProperties: false
    },
    candidate: {
      type: "object",
      properties: {
        candidateId: { type: "string", minLength: 1 },
        packageHash: packageHashString
      },
      required: ["candidateId", "packageHash"],
      additionalProperties: false
    },
    verifier: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["replay", "held-out-evaluation"] },
        summary: { type: "string", minLength: 1 },
        evidence: { type: "string", minLength: 1 }
      },
      required: ["kind", "summary", "evidence"],
      additionalProperties: false
    },
    provenanceHashes: { type: "array", items: sha256Digest },
    decidedAt: { type: "string" }
  },
  required: ["schemaVersion", "decisionId", "idempotencyKey", "verdict", "workflow", "candidate", "verifier", "provenanceHashes", "decidedAt"],
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
    name: "brain_retrieve",
    description: "Retrieve bounded hot context with explainable quick, standard, or deep ranking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 500 },
        tier: { type: "string", enum: ["quick", "standard", "deep"] },
        limit: { type: "integer", minimum: 1, maximum: 40 },
        filters: {
          type: "object",
          properties: {
            types: { type: "array", items: artifactType, uniqueItems: true },
            layers: { type: "array", items: artifactLayer, uniqueItems: true },
            sensitivities: { type: "array", items: sensitivity, uniqueItems: true },
            statuses: { type: "array", items: { type: "string", enum: ["draft", "accepted", "disputed", "superseded"] }, uniqueItems: true },
            updatedAfter: { type: "string" },
            updatedBefore: { type: "string" },
            hasSource: { type: "boolean" }
          },
          additionalProperties: false
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "brain_health",
    description: "Lint read-only Brain store, audit log, and derived index consistency.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "brain_read",
    description: "Read one authorized second-brain artifact.",
    inputSchema: { type: "object", properties: { artifactId }, required: ["artifactId"], additionalProperties: false }
  },
  {
    name: "brain_capture",
    description: "Capture a new second-brain artifact. Semantic metadata is normalized without data loss and reported in provenance.skillloomCapture; server-owned identity fields remain forbidden.",
    inputSchema: {
      type: "object",
      properties: {
        requestId,
        type: { type: "string" },
        title: { type: "string", minLength: 1, maxLength: 500 },
        content: { type: "string", maxLength: 2_000_000 },
        frontmatter: jsonObject,
        provenance: jsonObject,
        layer: { type: "string" },
        source: semanticValue,
        details: semanticValue,
        sensitivity: { type: "string" }
      },
      required: ["requestId", "title", "content"],
      additionalProperties: true
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
        layer: artifactLayer,
        details: artifactDetails,
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
        files: { type: "array", items: packageFile, minItems: 1, maxItems: 256 },
        workflowProof
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
        channel: { type: "string", enum: ["stable"] },
        workflowProof
      },
      required: ["requestId", "candidateId", "version", "channel"],
      additionalProperties: false
    }
  }
];

export function listBrainMcpTools(): readonly BrainMcpToolDefinition[] {
  return definitions;
}
