/**
 * One way of writing a key for the whole config, whoever reads it: tmux's own names (`M-h`, `C-c`,
 * `S-Left`, `PageUp`, `Enter`, a single character). A key is written in one canonical form, with
 * the modifiers in the order M, C, S, so two spellings of one key are one key.
 */

export type ParsedKey = { ok: true; key: string } | { ok: false; reason: string };

/** What each key is called by tmux, in lower case, and the name it is stored under. */
const NAMED: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pgup: 'PageUp',
  ppage: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  npage: 'PageDown',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  tab: 'Tab',
  btab: 'BTab',
  bspace: 'BSpace',
  backspace: 'BSpace',
  delete: 'Delete',
  dc: 'Delete',
  insert: 'Insert',
  ic: 'Insert',
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`f${index + 1}`, `F${index + 1}`]),
  ),
};

/** The names a terminal sends to a program in raw mode in a way that lets it tell them apart. */
const TERMINAL_NAMES = new Set([
  'Up',
  'Down',
  'Left',
  'Right',
  'PageUp',
  'PageDown',
  'Delete',
  'Enter',
  'Escape',
  'BSpace',
  'Space',
]);
/** Of those, the ones a terminal also sends with Ctrl, Shift or Alt held. */
const TERMINAL_MODIFIABLE = new Set([
  'Up',
  'Down',
  'Left',
  'Right',
  'PageUp',
  'PageDown',
  'Delete',
]);
/** In a terminal Ctrl+these are Backspace, Tab, Enter and Escape: not keys of their own. */
const TERMINAL_CTRL_TAKEN = new Set(['h', 'i', 'j', 'm']);

export type Grammar = 'tmux' | 'terminal';

type Parts = { meta: boolean; ctrl: boolean; shift: boolean; base: string };

const compose = (parts: Parts): string =>
  `${parts.meta ? 'M-' : ''}${parts.ctrl ? 'C-' : ''}${parts.shift ? 'S-' : ''}${parts.base}`;

/** Reads a key as the config writes it; `grammar` says which keys the reader can get at all. */
export function parseKey(text: string, grammar: Grammar): ParsedKey {
  const parts: Parts = { meta: false, ctrl: false, shift: false, base: '' };
  let rest = text;

  for (;;) {
    const prefix = /^([MCS])-(.+)$/su.exec(rest);

    if (!prefix) break;

    const flag = { M: 'meta', C: 'ctrl', S: 'shift' }[prefix[1] as 'M' | 'C' | 'S'] as
      'meta' | 'ctrl' | 'shift';

    if (parts[flag]) return { ok: false, reason: `"${text}" repeats a modifier` };

    parts[flag] = true;
    rest = prefix[2] as string;
  }

  if (rest === '') return { ok: false, reason: 'is empty' };

  const single = Array.from(rest).length === 1;
  const base = baseOf(rest);

  if (!base) return { ok: false, reason: `"${text}" is not a key name` };

  parts.base = base;

  const problem = single ? checkCharacter(parts, grammar) : checkNamed(parts, grammar);

  if (problem) return { ok: false, reason: `"${text}" ${problem}` };

  if (single && parts.ctrl) parts.base = base.toLowerCase();

  return { ok: true, key: compose(parts) };
}

/** The key a name or character stands for, or nothing when it is neither. */
function baseOf(name: string): string | undefined {
  if (Array.from(name).length !== 1) return NAMED[name.toLowerCase()];

  return name === ' ' ? 'Space' : name;
}

function checkCharacter(parts: Parts, grammar: Grammar): string | undefined {
  const { base } = parts;

  if (base === 'Space') return checkNamed(parts, grammar);

  if (parts.shift) return 'cannot use S- with a character: write the character itself (G, not S-g)';

  if (parts.ctrl) {
    // tmux gets a Ctrl+digit as an extended key (`extended-keys` is on); a terminal program
    // would only see the digit.
    const allowed = grammar === 'tmux' ? /^[a-zA-Z0-9]$/ : /^[a-zA-Z]$/;

    if (!allowed.test(base)) return 'can only use C- with a letter';

    if (grammar === 'terminal' && TERMINAL_CTRL_TAKEN.has(base.toLowerCase())) {
      return `is the same key to a terminal as Backspace, Tab or Enter (C-${base.toLowerCase()})`;
    }
  }

  if (grammar === 'tmux' && base === ';') {
    return 'cannot be bound: tmux reads ; as the end of a command';
  }

  return undefined;
}

function checkNamed(parts: Parts, grammar: Grammar): string | undefined {
  if (grammar !== 'terminal') return undefined;

  if (!TERMINAL_NAMES.has(parts.base)) return `is a key a terminal program cannot read here`;

  if ((parts.meta || parts.ctrl || parts.shift) && !TERMINAL_MODIFIABLE.has(parts.base)) {
    return `cannot be used with a modifier: a terminal does not report that`;
  }

  return undefined;
}

/** Characters that are typed text when a screen takes text, rather than being commands. */
export function isPrintable(key: string): boolean {
  return key === 'Space' || Array.from(key).length === 1;
}

/** The character a printable key types. */
export function typedText(key: string): string {
  return key === 'Space' ? ' ' : key;
}

const BASE_LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '⏎',
  BSpace: '⌫',
  Escape: 'esc',
  Space: 'space',
  Delete: 'Del',
};

/** A key as a person reads it, for help text. */
export function keyLabel(key: string): string {
  const match = /^((?:[MCS]-)*)(.+)$/su.exec(key) as RegExpExecArray;
  const modifiers = (match[1] as string)
    .split('-')
    .filter(Boolean)
    .map((letter) => ({ M: 'Alt+', C: 'Ctrl+', S: 'Shift+' })[letter as 'M' | 'C' | 'S']);
  const base = match[2] as string;

  return `${modifiers.join('')}${BASE_LABELS[base] ?? base}`;
}

/**
 * The key a terminal program read (the names `parseKeys` gives: `up`, `alt+f`, `ctrl+right`,
 * a character) as the config writes it. Nothing for a key that has no such name.
 */
export function fromTerminal(read: string): string | undefined {
  const match = /^((?:alt\+|ctrl\+|shift\+)*)(.+)$/su.exec(read);

  if (!match) return undefined;

  const prefix = match[1] as string;
  const name = match[2] as string;
  const base =
    TERMINAL_BASES[name] ?? (Array.from(name).length === 1 ? singleBase(name) : undefined);

  if (!base) return undefined;

  return compose({
    meta: prefix.includes('alt+'),
    ctrl: prefix.includes('ctrl+'),
    shift: prefix.includes('shift+'),
    base,
  });
}

const TERMINAL_BASES: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  delete: 'Delete',
  enter: 'Enter',
  escape: 'Escape',
  backspace: 'BSpace',
};

function singleBase(character: string): string {
  return character === ' ' ? 'Space' : character;
}
