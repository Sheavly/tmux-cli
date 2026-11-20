import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** When a chat's last prompt was, and the `updatedAt` of the chat when that was read. */
export type PromptTime = { at: number; updatedAt: number };

/**
 * What was read of each chat's last prompt, kept in a file of our own (`prompt-times.json` next to
 * the config file) so a restart doesn't read every history again, and so a history that can't be
 * read now still has the last time it was. Only a cache: a file that is missing or wrong is
 * empty, never an error.
 */
export async function readPromptTimes(file: string): Promise<Map<string, PromptTime>> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));

    if (typeof value !== 'object' || value === null || Array.isArray(value)) return new Map();

    return new Map(Object.entries(value).filter(isEntry));
  } catch {
    return new Map();
  }
}

function isEntry(entry: [string, unknown]): entry is [string, PromptTime] {
  const value = entry[1] as Partial<PromptTime> | null;

  return typeof value?.at === 'number' && typeof value.updatedAt === 'number';
}

/** Writes the times of the chats in `keep` and no others, so deleted chats don't pile up. */
export async function writePromptTimes(params: {
  file: string;
  times: ReadonlyMap<string, PromptTime>;
  keep: ReadonlySet<string>;
}): Promise<void> {
  const { file, times, keep } = params;
  const kept = Object.fromEntries([...times].filter(([id]) => keep.has(id)));

  await mkdir(path.dirname(file), { recursive: true });

  // Renamed into place so a second sidebar never reads half a file.
  const temporary = `${file}.${process.pid}.tmp`;

  await writeFile(temporary, `${JSON.stringify(kept, null, 2)}\n`);
  await rename(temporary, file);
}
