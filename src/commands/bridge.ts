import { runBridgeStdio } from "../bridge/index.js";
import type { BridgeStdioOptions } from "../bridge/index.js";
import { createDefaultBridgeOptions } from "../setup/defaults.js";

export async function bridgeCommand(options?: BridgeStdioOptions): Promise<void> {
  await runBridgeStdio(options ?? await createDefaultBridgeOptions());
}
