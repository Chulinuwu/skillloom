export function obsidianProjectionFilename(title: string, artifactId: string): string {
  const safeTitle = Array.from(title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim())
    .slice(0, 120)
    .join("")
    .replace(/[ .]+$/u, "");
  return `${safeTitle || "Untitled"} [${artifactId.slice(0, 8)}].md`;
}
