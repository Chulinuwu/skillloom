import { createHubRuntime } from "./service.js";

async function main(): Promise<void> {
  const runtime = await createHubRuntime();
  await runtime.start();
  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
