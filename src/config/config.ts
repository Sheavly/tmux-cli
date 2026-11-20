import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTER_SETTING_KEYS, DEFAULT_ADAPTER } from '../harness/index.ts';
import { parseJsonObject } from './json-file.ts';
import { MOUSE_ALL, parseMouseSettings, type MouseSettings } from './mouse-settings.ts';
import {
  parseKeyOverrides,
  resolveBindings,
  type Bindings,
  type KeyOverrides,
} from '../keys/bindings.ts';

/** How a folder's chats are ordered: newest first by when they began, or by their last prompt. */
export type ChatOrder = 'started' | 'prompted';

const CHAT_ORDERS: readonly string[] = ['started', 'prompted'] satisfies ChatOrder[];

export type Config = {
  /** The order of the chats inside a folder of the sidebar. */
  chatOrder: ChatOrder;
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
  /**
   * Whether tmux's own keys and mouse menus are switched off in the session (the default). They can
   * open a window or split a pane beside the sidebar, which the layout does not expect; `false`
   * leaves tmux as it is, for someone who wants its prefix keys there.
   */
  lockTmux: boolean;
  /** Which things the mouse may do; all of them unless the file turns some off. */
  mouse: MouseSettings;
  /** The tmux socket name: a server of its own, so no other tmux settings or bindings are touched. */
  socket: string;
};

const FILE_KEYS = [
  'adapter',
  ...ADAPTER_SETTING_KEYS,
  'sidebarWidth',
  'chatOrder',
  'escapeTime',
  'lockTmux',
  'mouse',
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
    adapterSettings: file.adapterSettings ?? {},
    sidebarWidth: file.sidebarWidth ?? 34,
    chatOrder: file.chatOrder ?? 'prompted',
    escapeTime: file.escapeTime,
    lockTmux: file.lockTmux ?? true,
    mouse: file.mouse ?? MOUSE_ALL,
    socket: file.socket ?? 'sheavly',
  };
}

function defaultReadFile(file: string): string {
  return readFileSync(file, 'utf8');
}

type FileConfig = {
  adapter?: string;
  adapterSettings?: Record<string, string>;
  sidebarWidth?: number;
  chatOrder?: ChatOrder;
  escapeTime?: number;
  lockTmux?: boolean;
  mouse?: MouseSettings;
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
    ...parseAdapterSettings({ file, record }),
    ...stringField({ file, record, key: 'socket' }),
    ...numberField({ file, record, key: 'sidebarWidth', min: 16, max: 120 }),
    ...optionalField({
      file,
      record,
      key: 'chatOrder',
      accepts: (value) => typeof value === 'string' && CHAT_ORDERS.includes(value),
      wanted: '"started" or "prompted"',
    }),
    ...numberField({ file, record, key: 'escapeTime', min: 0, max: 500 }),
    ...(record.keys === undefined ? {} : { keys: parseKeyOverrides({ file, value: record.keys }) }),
    ...booleanField({ file, record, key: 'acceptUnboundKeys' }),
    ...booleanField({ file, record, key: 'lockTmux' }),
    ...(record.mouse === undefined
      ? {}
      : { mouse: parseMouseSettings({ file, value: record.mouse }) }),
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

/** The keys some adapter reads, kept as they are: only the adapter knows what they mean. */
function parseAdapterSettings(
  params: Omit<FieldParams, 'key'>,
): Pick<FileConfig, 'adapterSettings'> {
  const { file, record } = params;
  const settings: Record<string, string> = {};

  for (const key of ADAPTER_SETTING_KEYS) {
    Object.assign(settings, stringField({ file, record, key }));
  }

  return Object.keys(settings).length === 0 ? {} : { adapterSettings: settings };
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
