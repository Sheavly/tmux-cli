import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The folders the user moved, in the order they put them, kept in a file of our own
 * (`folder-order.json` next to the config file) as `["/path/a", "/path/b"]`.
 */
export async function readFolderOrder(file: string): Promise<string[]> {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return [];

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  const value: unknown = JSON.parse(text);

  if (!Array.isArray(value)) throw new Error(`${file} must hold a JSON array`);

  return value.filter((entry): entry is string => typeof entry === 'string');
}

export async function writeFolderOrder(params: { file: string; order: string[] }): Promise<void> {
  const { file, order } = params;

  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(order, null, 2)}\n`);
  await rename(temporary, file);
}
