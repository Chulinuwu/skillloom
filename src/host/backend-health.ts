const localBackendUrls = [
  "http://127.0.0.1:8787/healthz",
  "http://127.0.0.1:3000/"
] as const;

export async function localBackendsHealthy(request: typeof fetch = fetch): Promise<boolean> {
  const checks = await Promise.all(localBackendUrls.map(async (url) => {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }));
  return checks.every(Boolean);
}

export async function waitForLocalBackends(
  probe: () => Promise<boolean> = localBackendsHealthy,
  wait: (milliseconds: number) => Promise<void> = async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 60
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await probe()) return true;
    if (attempt + 1 < attempts) await wait(1_000);
  }
  return false;
}
