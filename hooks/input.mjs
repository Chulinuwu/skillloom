const MAX_INPUT_BYTES = 1024 * 1024;

export async function readHookInput(stream = process.stdin) {
  let source = "";
  for await (const chunk of stream) {
    source += chunk;
    if (source.length > MAX_INPUT_BYTES) return null;
  }
  try {
    const value = JSON.parse(source || "{}");
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return null;
  }
}
