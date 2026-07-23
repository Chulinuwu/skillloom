import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const markerName = ".skillloom-retrieval-benchmark.json";
const schemaVersion = 1;

export type RetrievalBenchmarkWorkspace = Readonly<{
  root: string;
  brainRoot: string;
  retained: boolean;
  resumed: boolean;
  cleanup: () => Promise<void>;
}>;

export async function prepareRetrievalBenchmarkWorkspace(input: {
  records: number;
  keep: boolean;
  workspace?: string;
}): Promise<RetrievalBenchmarkWorkspace> {
  if (!input.workspace) {
    const root = await mkdtemp(join(tmpdir(), "skillloom-retrieval-benchmark-"));
    try {
      await initialize(root, input.records);
      return {
        root,
        brainRoot: join(root, "brain"),
        retained: input.keep,
        resumed: false,
        cleanup: input.keep ? async () => undefined : async () => await rm(root, { recursive: true, force: true })
      };
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }

  const root = resolve(input.workspace);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  const resumed = entries.includes(markerName);
  if (!resumed && entries.length > 0) {
    throw new Error(`Benchmark workspace is not empty and has no ${markerName} marker`);
  }
  if (resumed) {
    await validateMarker(root, input.records);
  } else {
    await initialize(root, input.records);
  }
  return {
    root,
    brainRoot: join(root, "brain"),
    retained: true,
    resumed,
    cleanup: async () => undefined
  };
}

async function initialize(root: string, records: number): Promise<void> {
  await writeFile(
    join(root, markerName),
    `${JSON.stringify({ schemaVersion, records }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 }
  );
  await mkdir(join(root, "brain"));
}

async function validateMarker(root: string, records: number): Promise<void> {
  const value: unknown = JSON.parse(await readFile(join(root, markerName), "utf8"));
  if (
    typeof value !== "object"
    || value === null
    || !("schemaVersion" in value)
    || value.schemaVersion !== schemaVersion
    || !("records" in value)
    || value.records !== records
  ) {
    throw new Error("Benchmark workspace marker does not match this corpus size or schema");
  }
  await mkdir(join(root, "brain"), { recursive: true });
}
