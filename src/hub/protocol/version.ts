export const HUB_PROTOCOL_VERSION = "1.0";

export function isCanonicalEventSequence(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value);
}
