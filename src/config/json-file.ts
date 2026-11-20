import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** The text of a file of ours; undefined when it does not exist yet, an error naming it otherwise. */
export async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return undefined;

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }
}

/** Writes the value as JSON through a temporary file, so a crash never leaves half a file. */
export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

/** A plain object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The JSON object a file holds. A file that is wrong is an error naming it, not a default: a typo
 * silently falling back would start the wrong thing.
 */
export function parseJsonObject(params: { file: string; text: string }): Record<string, unknown> {
  const { file, text } = params;
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (caughtError) {
    throw new Error(`${file} is not valid JSON`, { cause: caughtError });
  }

  if (!isRecord(value)) throw new Error(`${file} must hold a JSON object`);

  return value;
}
