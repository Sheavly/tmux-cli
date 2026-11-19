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
  const next = { ...state, activeProfile: { ...state.activeProfile, [adapter]: id } };

  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temporary, file);
}

type State = { activeProfile?: Record<string, unknown> };

async function readState(file: string): Promise<State> {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return {};

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  const { activeProfile } = parseJsonObject({ file, text });

  if (activeProfile === undefined) return {};

  if (!isRecord(activeProfile)) throw new Error(`${file}: "activeProfile" must be an object`);

  return { activeProfile };
}
