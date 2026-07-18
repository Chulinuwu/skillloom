export function normalizePackageMode(mode: number): number {
  return mode & 0o777;
}
