import { open } from "node:fs/promises";
import { classifyToolName, containsCorrectionSignal } from "./context-signals.mjs";

const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

export async function countToolCalls(path) {
  const analysis = await analyzeTranscript(path);
  return analysis ? analysis.toolCalls : null;
}

export async function analyzeTranscript(path, sinceBytes = 0) {
  if (typeof path !== "string" || path.length === 0 || !Number.isInteger(sinceBytes) || sinceBytes < 0) return null;
  try {
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      const requestedStart = sinceBytes <= stat.size ? sinceBytes : 0;
      const start = Math.max(requestedStart, stat.size - MAX_TRANSCRIPT_BYTES);
      const length = stat.size - start;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return analyzeJsonLines(buffer.toString("utf8"), stat.size, start > requestedStart);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

function analyzeJsonLines(source, fileSize, truncated) {
  const analysis = {
    fileSize,
    truncated,
    toolCalls: 0,
    mutations: 0,
    research: 0,
    verifications: 0,
    correctionSignals: 0
  };
  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    try {
      inspectValue(JSON.parse(line), analysis);
    } catch {
    }
  }
  return analysis;
}

function inspectValue(value, analysis) {
  if (Array.isArray(value)) {
    for (const item of value) inspectValue(item, analysis);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (isToolCall(value)) {
    analysis.toolCalls += 1;
    const classification = classifyToolName(value.name ?? value.tool_name ?? "");
    if (classification.mutation) analysis.mutations += 1;
    if (classification.research) analysis.research += 1;
    if (classification.verification) analysis.verifications += 1;
  }
  if (value.role === "user" && containsCorrectionSignal(stringsIn(value.content).join(" "))) {
    analysis.correctionSignals += 1;
  }
  for (const child of Object.values(value)) inspectValue(child, analysis);
}

function isToolCall(value) {
  return (value.type === "tool_use" || value.type === "tool_call" || value.kind === "function_call")
    && (typeof value.name === "string" || typeof value.tool_name === "string");
}

function stringsIn(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(stringsIn);
}
