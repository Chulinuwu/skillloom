import { UsageError } from "../domain/errors.js";
import type { Command } from "../domain/types.js";

export function parseHostArguments(command: string | undefined, args: string[], json: boolean): Command | null {
  if (command !== "host") return null;
  const values = [...args];
  const action = values.shift();
  if (action !== "install" && action !== "status") throw new UsageError("host requires install or status");
  const yesIndex = values.indexOf("--yes");
  const yes = yesIndex >= 0;
  if (yes) values.splice(yesIndex, 1);
  if (action === "status" && yes) throw new UsageError("host status does not accept --yes");
  if (values.length > 0) throw new UsageError(`Unexpected argument: ${values[0]}`);
  return { command: "host", action, yes, json };
}
