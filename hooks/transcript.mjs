import { open } from "node:fs/promises";

const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

export async function countToolCalls(path) {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  try {
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      const length = Math.min(stat.size, MAX_TRANSCRIPT_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, Math.max(0, stat.size - length));
      const text = buffer.toString("utf8");
      return [...text.matchAll(/"(?:type|kind)"\s*:\s*"(?:tool_use|tool_call|function_call)"/gu)].length;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
