export interface AuthoringSyncPort {
  initialize?(): Promise<void>;
  sync(): Promise<unknown>;
}

export type AuthoringSyncLoop = Readonly<{
  start(): void;
  close(): Promise<void>;
}>;

export function createAuthoringSyncLoop(
  authoring: AuthoringSyncPort,
  intervalMs: number,
  onError: (error: unknown) => void = reportSyncError
): AuthoringSyncLoop {
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  let initialized = authoring.initialize === undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref();
  };
  const run = () => {
    if (stopped || inFlight !== undefined) return;
    inFlight = (async () => {
      try {
        if (!initialized) {
          await authoring.initialize?.();
          initialized = true;
        }
        await authoring.sync();
      } catch (error) {
        onError(error);
      }
    })().finally(() => {
      inFlight = undefined;
      schedule();
    });
  };

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      run();
    },
    async close(): Promise<void> {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await inFlight;
    }
  };
}

function reportSyncError(error: unknown): void {
  console.error("Obsidian authoring sync failed; retrying on the next interval", error);
}
