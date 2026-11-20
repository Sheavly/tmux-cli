import { parseHistoryEntry, scanHistoryTail } from './history-tail.ts';

/** The time of the last prompt among history lines, which may end with a cut line. */
export function lastPromptTime(lines: readonly string[]): number | undefined {
  for (const line of lines.toReversed()) {
    const entry = parseHistoryEntry(line);

    if (entry?.role === 'user' && entry.origin === 'user' && typeof entry.at === 'number') {
      return entry.at;
    }
  }

  return undefined;
}

/**
 * When the user last typed a prompt in the conversation. Undefined when there is none (or it is
 * further back than the window of the history that is read), and the caller falls back.
 */
export async function readLastPromptAt(params: { dir: string }): Promise<number | undefined> {
  return scanHistoryTail<number | undefined>({
    dir: params.dir,
    none: undefined,
    scan: (lines) => {
      const at = lastPromptTime(lines);

      return { result: at, done: at !== undefined };
    },
  });
}
