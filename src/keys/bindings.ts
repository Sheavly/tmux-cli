import { isRecord } from '../config/json-file.ts';
import { isPrintable, keyLabel, parseKey } from './key.ts';
import {
  ACTIONS,
  CONTEXTS,
  TEXT_MODES,
  grammarOf,
  type ActionDef,
  type ActionId,
  type Mode,
} from './registry.ts';

const DEFINITIONS: readonly ActionDef[] = ACTIONS;
const BY_ID = new Map<string, ActionDef>(DEFINITIONS.map((action) => [action.id, action]));

/** What the config file's `keys` holds once it has been read and checked. */
export type KeyOverrides = {
  /** The keys of each action the file sets, written the canonical way; none means unbound. */
  keys: Map<ActionId, string[]>;
  /** False when the file turned off our additions to tmux's copy mode. */
  copyMode: boolean;
};

export type Bindings = {
  /** The keys of an action, in the canonical form; none when it is unbound. */
  keys(id: ActionId): string[];
  /** What a key does in a mode: `key` is as `fromTerminal` gives it. */
  action(mode: Mode, key: string): ActionId | undefined;
  /** Whether our additions to tmux's copy mode are on. */
  copyMode: boolean;
  /** Every action, with the keys it has now. */
  list(): { id: ActionId; description: string; keys: string[]; defaults: string[] }[];
};

const NO_OVERRIDES: KeyOverrides = { keys: new Map(), copyMode: true };

/**
 * Reads the `keys` of the config file. Like the rest of that file, a mistake is an error rather
 * than a quiet fall back to the default: a key that doesn't do what it was set to is worse than
 * a program that says so.
 */
export function parseKeyOverrides(params: { file: string; value: unknown }): KeyOverrides {
  const { file, value } = params;

  if (!isRecord(value)) throw new Error(`${file}: "keys" must be an object`);

  const overrides: KeyOverrides = { keys: new Map(), copyMode: true };

  for (const [context, section] of Object.entries(value)) {
    readSection({ file, context, section, overrides });
  }

  return overrides;
}

/** One group of the config's `keys`, added to `overrides`. */
function readSection(params: {
  file: string;
  context: string;
  section: unknown;
  overrides: KeyOverrides;
}): void {
  const { file, context, section, overrides } = params;
  const where = (path: string): string => `${file}: keys.${path}`;

  if (!CONTEXTS.includes(context)) {
    throw new Error(`${where(context)}: unknown group (one of ${CONTEXTS.join(', ')})`);
  }

  if (section === false && context === 'copyMode') {
    overrides.copyMode = false;

    return;
  }

  if (!isRecord(section)) {
    const or = context === 'copyMode' ? ' (or false)' : '';

    throw new Error(`${where(context)} must be an object of actions${or}`);
  }

  for (const [name, setting] of Object.entries(section)) {
    const id = `${context}.${name}`;

    if (!BY_ID.has(id)) {
      const known = DEFINITIONS.filter((action) => action.id.startsWith(`${context}.`))
        .map((action) => action.id.slice(context.length + 1))
        .join(', ');

      throw new Error(`${where(id)}: unknown action (one of ${known})`);
    }

    overrides.keys.set(id as ActionId, readKeys({ id, setting, where: where(id) }));
  }
}

function readKeys(params: { id: string; setting: unknown; where: string }): string[] {
  const { id, setting, where } = params;
  const context = id.split('.')[0] as string;
  const grammar = grammarOf(context);

  if (setting === null) return [];

  const list = typeof setting === 'string' ? [setting] : setting;

  if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${where} must be a key, a list of keys, or null to leave it unbound`);
  }

  const keys: string[] = [];

  for (const entry of list as string[]) {
    const parsed = parseKey(entry, grammar);

    if (!parsed.ok) throw new Error(`${where}: ${parsed.reason}`);

    if (['text', 'popup'].includes(context) && isTypedHere(context, parsed.key)) {
      throw new Error(`${where}: "${entry}" is typed as text there, so it cannot be a command`);
    }

    if (!keys.includes(parsed.key)) keys.push(parsed.key);
  }

  return keys;
}

/** The text screens take letters (the popup takes digits) as text. */
function isTypedHere(context: string, key: string): boolean {
  return context === 'popup' ? /^[0-9]$/.test(key) : isPrintable(key);
}

/**
 * The defaults with the file's changes on top. Throws when one key would do two things in one
 * screen; the warnings say what can no longer be done, which the user has to accept.
 */
export function resolveBindings(params: { overrides?: KeyOverrides; file?: string } = {}): {
  bindings: Bindings;
  warnings: string[];
} {
  const { overrides = NO_OVERRIDES, file = 'the config file' } = params;
  const keysOf = new Map<ActionId, string[]>(
    DEFINITIONS.map((action) => [action.id as ActionId, keysFor({ action, overrides })]),
  );
  const byMode = tablesOf({ keysOf, file });
  const warnings = DEFINITIONS.filter(
    (action) => action.critical && (keysOf.get(action.id as ActionId) ?? []).length === 0,
  ).map((action) => `${action.id} has no key, so you cannot ${action.description}`);

  const bindings: Bindings = {
    keys: (id) => [...(keysOf.get(id) ?? [])],
    action: (mode, key) => byMode.get(mode)?.get(key),
    copyMode: overrides.copyMode,
    list: () =>
      DEFINITIONS.map((action) => ({
        id: action.id as ActionId,
        description: action.description,
        keys: [...(keysOf.get(action.id as ActionId) ?? [])],
        defaults: canonical(action),
      })),
  };

  return { bindings, warnings };
}

/** The keys an action has: the file's, else the default; none for our copy mode when it is off. */
function keysFor(params: { action: ActionDef; overrides: KeyOverrides }): string[] {
  const { action, overrides } = params;

  if (!overrides.copyMode && action.id.startsWith('copyMode.')) return [];

  return overrides.keys.get(action.id as ActionId) ?? canonical(action);
}

/** For each mode, what each key does there. Throws when a key would do two things at once. */
function tablesOf(params: {
  keysOf: ReadonlyMap<ActionId, string[]>;
  file: string;
}): Map<Mode, Map<string, ActionId>> {
  const { keysOf, file } = params;
  const byMode = new Map<Mode, Map<string, ActionId>>();

  for (const action of DEFINITIONS) {
    for (const mode of action.modes) {
      const table = byMode.get(mode) ?? new Map<string, ActionId>();

      byMode.set(mode, table);

      for (const key of keysOf.get(action.id as ActionId) ?? []) {
        addKey({ table, mode, action, key, file });
      }
    }
  }

  return byMode;
}

function addKey(params: {
  table: Map<string, ActionId>;
  mode: Mode;
  action: ActionDef;
  key: string;
  file: string;
}): void {
  const { table, mode, action, key, file } = params;

  // In a screen that takes text, a plain character is typed whatever it is bound to.
  if (TEXT_MODES.has(mode) && !action.id.startsWith('text.') && isPrintable(key)) return;

  const taken = table.get(key);

  if (taken && taken !== action.id) {
    throw new Error(
      `${file}: keys: "${keyLabel(key)}" is bound to both ${taken} and ${action.id}` +
        ` (they are used at the same time, in ${mode})`,
    );
  }

  table.set(key, action.id as ActionId);
}

/** The defaults are written in the registry the way a person would; this is their canonical form. */
function canonical(action: ActionDef): string[] {
  return action.keys.map((key) => {
    const parsed = parseKey(key, 'tmux');

    return parsed.ok ? parsed.key : key;
  });
}

export const defaultBindings = (): Bindings => resolveBindings().bindings;
