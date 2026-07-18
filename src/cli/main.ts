#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArguments } from "./arguments.js";
import { formatOutput } from "./output.js";
import { SkillloomError } from "../domain/errors.js";
import { initCommand } from "../commands/init.js";
import { captureCommand } from "../commands/capture.js";
import { validateCommand } from "../commands/validate.js";
import { statusCommand } from "../commands/status.js";
import { promoteCommand } from "../commands/promote.js";
import { doctorCommand } from "../commands/doctor.js";
import { resumeCommand } from "../commands/resume.js";
import { rollbackCommand } from "../commands/rollback.js";
import { recoverLockCommand } from "../commands/recover-lock.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const command = parseArguments(argv);
    const result = await run(command);
    process.stdout.write(formatOutput(result, command.json));
    return 0;
  } catch (error) {
    const exitCode = error instanceof SkillloomError ? error.exitCode : 1;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return exitCode;
  }
}

async function run(command: ReturnType<typeof parseArguments>) {
  if (command.command === "init") {
    return await initCommand(command);
  }
  if (command.command === "capture") {
    return await captureCommand(command);
  }
  if (command.command === "validate") {
    return await validateCommand(command);
  }
  if (command.command === "promote") {
    return await promoteCommand(command);
  }
  if (command.command === "doctor") {
    return await doctorCommand(command);
  }
  if (command.command === "resume") {
    return await resumeCommand(command);
  }
  if (command.command === "rollback") {
    return await rollbackCommand(command);
  }
  if (command.command === "recover-lock") {
    return await recoverLockCommand(command);
  }
  return await statusCommand(command);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
