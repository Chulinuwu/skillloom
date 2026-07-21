import { join } from "node:path";
import { STORE_DIR } from "../../config/defaults.js";
import { HUB_STATE_DIR } from "./constants.js";

export function hubClientLayout(projectRoot: string) {
  const root = join(projectRoot, STORE_DIR, HUB_STATE_DIR);
  return {
    root,
    trust: join(root, "trust.json"),
    endpoint: join(root, "endpoint.json"),
    sync: join(root, "sync.json"),
    pending: join(root, "pending")
  };
}
