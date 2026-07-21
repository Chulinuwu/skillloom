import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { ConsentPort } from "./types.js";

type TerminalReadable = Readable & { isTTY?: boolean };
type TerminalWritable = Writable & { isTTY?: boolean };

export class TerminalConsentPort implements ConsentPort {
  readonly interactive: boolean;

  constructor(
    private readonly input: TerminalReadable = process.stdin,
    private readonly output: TerminalWritable = process.stdout
  ) {
    this.interactive = input.isTTY === true && output.isTTY === true;
  }

  async confirm(message: string): Promise<boolean> {
    const prompt = createInterface({ input: this.input, output: this.output });
    try {
      const answer = await prompt.question(`${message} [y/N] `);
      return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    } finally {
      prompt.close();
    }
  }
}
