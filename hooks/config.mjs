import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { modeProfileFor } from "../mode-profile.mjs";

export async function readSkillloomMode(root) {
  try {
    const value = JSON.parse(await readFile(join(root, ".skillloom", "config.json"), "utf8"));
    const mode = value?.mode === "policy" || value?.mode === "hermes" ? value.mode : "manual";
    const minToolCalls = Number.isInteger(value?.hermes?.minToolCalls) && value.hermes.minToolCalls > 0
      ? value.hermes.minToolCalls
      : 3;
    return { mode, minToolCalls, automation: modeProfileFor(mode) };
  } catch {
    return { mode: "manual", minToolCalls: 3, automation: modeProfileFor("manual") };
  }
}
