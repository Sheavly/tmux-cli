import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configFilePath } from '../config/config.ts';
import { isRecord, parseJsonObject } from '../config/json-file.ts';

/** Where our own state is kept: `state.json` next to the config file. */
export function stateFilePath(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return path.join(path.dirname(configFilePath(env, home)), 'state.json');
}

/**
 * The profile that was active last time for an adapter, so it is still the one after a restart.
 * Kept as `{ "activeProfile": { "<adapter>": "<profile id>" } }`: our own file, never the
 * harness's. Undefined when there is none; a file that is wrong is an error, like the config.
 */
export async function readActiveProfile(params: {
  file: string;
  adapter: string;
}): Promise<string | undefined> {
  const state = await readState(params.file);
  const id = state.activeProfile?.[params.adapter];

  return typeof id === 'string' && id !== '' ? id : undefined;
}

export async function writeActiveProfile(params: {
  file: string;
  adapter: string;
  id: string;
}): Promise<void> {
  const { file, adapter, id } = params;
  const state = await readState(file);

  await writeState(file, { ...state, activeProfile: { ...state.activeProfile, [adapter]: id } });
}

/**
 * The folders the user folded, so they are still folded after a restart. Kept as
 * `{ "collapsed": ["/path"] }` in the same file; a value that is not a list of paths is ignored.
 */
export async function readCollapsed(file: string): Promise<string[]> {
  const { collapsed } = await readState(file);

  return Array.isArray(collapsed)
    ? collapsed.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export async function writeCollapsed(params: {
  file: string;
  folders: Iterable<string>;
}): Promise<void> {
  const state = await readState(params.file);

  await writeState(params.file, { ...state, collapsed: [...params.folders] });
}

/**
 * Whether the list shows only the chats that are running, kept as `{ "runningOnly": true }` in the
 * same file. Anything but `true` is off.
 */
export async function readRunningOnly(file: string): Promise<boolean> {
  return (await readState(file)).runningOnly === true;
}

export async function writeRunningOnly(params: { file: string; on: boolean }): Promise<void> {
  const state = await readState(params.file);

  await writeState(params.file, { ...state, runningOnly: params.on });
}

async function writeState(file: string, state: State): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, file);
}

type State = Record<string, unknown> & { activeProfile?: Record<string, unknown> };

/** Every key the file holds is kept, so what one feature saves is not lost when another does. */
async function readState(file: string): Promise<State> {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return {};

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  const state = parseJsonObject({ file, text });

  if (state.activeProfile !== undefined && !isRecord(state.activeProfile)) {
    throw new Error(`${file}: "activeProfile" must be an object`);
  }

  return state;
}
