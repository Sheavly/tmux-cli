import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ADAPTER } from '../harness/index.ts';
import { parseJsonObject } from './json-file.ts';
import {
  parseKeyOverrides,
  resolveBindings,
  type Bindings,
  type KeyOverrides,
} from '../keys/bindings.ts';

export type Config = {
  /** Our keys: the defaults, with what the file's `keys` changes. */
  keys: Bindings;
  /** What the changed keys can no longer do; starting asks the user to accept it. */
  keyWarnings: string[];
  /** Set once the user has accepted that, so starting stops asking. */
  acceptUnboundKeys: boolean;
  /** Which harness adapter to use (see `src/harness`). */
  adapter: string;
  /**
   * The adapter's own settings from the file, passed on as they are: `harnessDir`, `command` and
   * `mode` for sheavly-v1. The adapter fills in defaults and reads its environment variables.
   */
  adapterSettings: Record<string, string>;
  sidebarWidth: number;
  /**
   * How long tmux waits after an Escape for the rest of a key, in milliseconds. An Alt key reaches
   * it as Escape and the key; over a slow connection those can arrive apart, and the key is then
   * read as Escape and a typed letter, so a higher value is for ssh. Left out, tmux's setting is 10.
   */
  escapeTime: number | undefined;
  /** The tmux socket name: a server of its own, so no other tmux settings or bindings are touched. */
  socket: string;
};

const ADAPTER_KEYS = ['harnessDir', 'command', 'mode'] as const;
const FILE_KEYS = [
  'adapter',
  ...ADAPTER_KEYS,
  'sidebarWidth',
  'escapeTime',
  'socket',
  'keys',
  'acceptUnboundKeys',
] as const;

export function configFilePath(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.XDG_CONFIG_HOME ?? path.join(home, '.config');

  return path.join(base, 'sheavly-tmux', 'config.json');
}

/**
 * Defaults, then the optional config file, then env. A config file that exists but is wrong is an
 * error: a typo in a key silently falling back to a default would start the wrong command.
 */
export function loadConfig(
  params: { env?: NodeJS.ProcessEnv; home?: string; readFile?: (file: string) => string } = {},
): Config {
  const { env = process.env, home = os.homedir(), readFile = defaultReadFile } = params;
  const filePath = configFilePath(env, home);
  const file = readConfigFile({ file: filePath, readFile });
  const { bindings, warnings } = resolveBindings({
    ...(file.keys ? { overrides: file.keys } : {}),
    file: filePath,
  });

  return {
    keys: bindings,
    keyWarnings: warnings,
    acceptUnboundKeys: file.acceptUnboundKeys ?? false,
    adapter: file.adapter ?? DEFAULT_ADAPTER,
    adapterSettings: Object.fromEntries(
      ADAPTER_KEYS.flatMap((key) => {
        const value = file[key];

        return value === undefined ? [] : [[key, value] as const];
      }),
    ),
    sidebarWidth: file.sidebarWidth ?? 34,
    escapeTime: file.escapeTime,
    socket: file.socket ?? 'sheavly',
  };
}

function defaultReadFile(file: string): string {
  return readFileSync(file, 'utf8');
}

type FileConfig = {
  adapter?: string;
  harnessDir?: string;
  mode?: string;
  command?: string;
  sidebarWidth?: number;
  escapeTime?: number;
  socket?: string;
  keys?: KeyOverrides;
  acceptUnboundKeys?: boolean;
};

function readConfigFile(params: { file: string; readFile: (file: string) => string }): FileConfig {
  const { file, readFile } = params;
  let text: string;

  try {
    text = readFile(file);
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return {};

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  return parseConfigFile({ file, text });
}

function parseConfigFile(params: { file: string; text: string }): FileConfig {
  const { file, text } = params;
  const record = parseJsonObject({ file, text });
  const unknownKey = Object.keys(record).find(
    (key) => !(FILE_KEYS as readonly string[]).includes(key),
  );

  if (unknownKey) throw new Error(`${file}: unknown key "${unknownKey}"`);

  return {
    ...stringField({ file, record, key: 'adapter' }),
    ...stringField({ file, record, key: 'harnessDir' }),
    ...stringField({ file, record, key: 'command' }),
    ...stringField({ file, record, key: 'mode' }),
    ...stringField({ file, record, key: 'socket' }),
    ...numberField({ file, record, key: 'sidebarWidth', min: 16, max: 120 }),
    ...numberField({ file, record, key: 'escapeTime', min: 0, max: 500 }),
    ...(record.keys === undefined ? {} : { keys: parseKeyOverrides({ file, value: record.keys }) }),
    ...booleanField({ file, record, key: 'acceptUnboundKeys' }),
  };
}

type FieldParams = { file: string; record: Record<string, unknown>; key: string };

/** A key of the file that may be left out; when it is there it must be what `accepts` says. */
function optionalField(
  params: FieldParams & { accepts: (value: unknown) => boolean; wanted: string },
) {
  const { file, record, key, accepts, wanted } = params;
  const value = record[key];

  if (value === undefined) return {};

  if (!accepts(value)) throw new Error(`${file}: "${key}" must be ${wanted}`);

  return { [key]: value };
}

const booleanField = (params: FieldParams) =>
  optionalField({
    ...params,
    accepts: (value) => typeof value === 'boolean',
    wanted: 'true or false',
  });

const stringField = (params: FieldParams) =>
  optionalField({
    ...params,
    accepts: (value) => typeof value === 'string' && value !== '',
    wanted: 'a non-empty string',
  });

const numberField = (params: FieldParams & { min: number; max: number }) =>
  optionalField({
    ...params,
    accepts: (value) =>
      Number.isInteger(value) && (value as number) >= params.min && (value as number) <= params.max,
    wanted: `a whole number from ${params.min} to ${params.max}`,
  });
