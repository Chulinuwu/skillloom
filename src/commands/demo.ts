import type { Command } from "../domain/types.js";
import { runDemo } from "../demo/service.js";

export async function demoCommand(command: Extract<Command, { command: "demo" }>) {
  return await runDemo(command.keep);
}
