import { appendEvent } from "../../src/store/journal.js";

const [root, operationId] = process.argv.slice(2);

await appendEvent(root, {
  operationId,
  kind: "status",
  phase: "interrupted"
}, () => {
  process.kill(process.pid, "SIGKILL");
});
