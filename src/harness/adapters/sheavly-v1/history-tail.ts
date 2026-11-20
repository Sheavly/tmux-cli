import path from 'node:path';
import { openIfExists } from './open-file.ts';

/** How much of the end of the history is read, widening until the scan is satisfied. */
const TAIL_BYTES = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024];

/** One message of a history line, as far as the manager reads it. */
export type HistoryEntry = {
  role?: unknown;
  origin?: unknown;
  content?: unknown;
  toolCalls?: unknown;
  /** Epoch milliseconds when sheavly wrote it. */
  at?: unknown;
};

/** The message of a history line, or undefined for a line that is cut off or not a record. */
export function parseHistoryEntry(line: string): HistoryEntry | undefined {
  try {
    return (JSON.parse(line) as { entry?: HistoryEntry }).entry;
  } catch {
    return undefined;
  }
}

/** What a scan made of the lines it was given, and whether it needs no more of the history. */
export type TailScan<T> = { result: T; done: boolean };

/**
 * Runs `scan` on the end of a conversation's history, which can be megabytes, with a window that
 * widens until the scan is `done` or the whole file has been read. `scan` gets whole lines only.
 * `none` is the result when the chat has no history yet.
 */
export async function scanHistoryTail<T>(params: {
  dir: string;
  none: T;
  scan: (lines: string[]) => TailScan<T>;
}): Promise<T> {
  const handle = await openIfExists(path.join(params.dir, 'history.jsonl'));

  if (!handle) return params.none;

  try {
    const { size } = await handle.stat();
    let outcome: TailScan<T> = { result: params.none, done: false };

    for (const bytes of TAIL_BYTES) {
      const length = Math.min(bytes, size);
      const buffer = Buffer.alloc(length);

      await handle.read(buffer, 0, length, size - length);

      const lines = buffer.toString('utf8').split('\n');

      // Unless the whole file was read, the first line is cut off at its start.
      if (length < size) lines.shift();

      outcome = params.scan(lines);

      if (outcome.done || length >= size) break;
    }

    return outcome.result;
  } finally {
    await handle.close();
  }
}
