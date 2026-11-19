import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanLabel } from '../terminal/text.ts';

/**
 * Names the user gave chats, kept in a file of our own (`names.json` next to the config file) as
 * `{ "<chat id>": "name" }`. Sheavly's conversation files are never touched.
 */
export async function readNames(file: string): Promise<Map<string, string>> {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return new Map();

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  const value: unknown = JSON.parse(text);

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${file} must hold a JSON object`);
  }

  return new Map(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** Sets a chat's name, or removes it when the name is empty. Returns the cleaned name. */
export async function writeName(params: {
  file: string;
  names: Map<string, string>;
  id: string;
  name: string;
}): Promise<string> {
  const { file, names, id } = params;
  const name = cleanLabel(params.name);

  if (name) names.set(id, name);
  else names.delete(id);

  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(Object.fromEntries(names), null, 2)}\n`);
  await rename(temporary, file);

  return name;
}
