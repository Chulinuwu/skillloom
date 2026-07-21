import {
  parseCandidateRecord,
  parsePublishResult,
  type RegistryProposalResult,
  type RegistryPublishResult
} from "../registry/index.js";

export function parseRegistryProposalEnvelope(value: unknown): RegistryProposalResult {
  return parseCandidateRecord(value);
}

export function parseRegistryPublishEnvelope(value: unknown): RegistryPublishResult {
  return parsePublishResult(value);
}
