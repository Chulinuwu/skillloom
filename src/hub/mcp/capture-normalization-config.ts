export const brainCaptureFields = [
  "requestId",
  "type",
  "layer",
  "title",
  "content",
  "frontmatter",
  "provenance",
  "source",
  "details",
  "sensitivity"
] as const;

export const reservedBrainCaptureFields = [
  "actor",
  "actorId",
  "artifactId",
  "createdAt",
  "createdBy",
  "id",
  "revision",
  "updatedAt",
  "updatedBy"
] as const;
