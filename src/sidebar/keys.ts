import {
  parseMouseReport,
  SPLIT_AT_REPORTS,
  type MouseEvent,
  type MouseReading,
} from '../terminal/mouse.utils.ts';

/**
 * A key as a terminal program reads it: a character, or a name such as `up`, `enter`, `escape`,
 * `backspace`, `pageup`, `delete`, `alt+f` or `ctrl+right`.
 */
export type Key = string;

const ESCAPES: Record<string, Key> = {
  '\u001b[A': 'up',
  '\u001b[B': 'down',
  '\u001bOA': 'up',
  '\u001bOB': 'down',
  '\u001b[C': 'right',
  '\u001b[D': 'left',
  '\u001bOC': 'right',
  '\u001bOD': 'left',
  '\u001b[I': 'focus',
  '\u001b[O': 'focus',
  '\u001b[3~': 'delete',
  '\u001b[5~': 'pageup',
  '\u001b[6~': 'pagedown',
};

/** What a raw terminal sends a program: a key, or (once it has asked for them) the mouse. */
export type Input = { kind: 'key'; key: Key } | { kind: 'mouse'; mouse: MouseEvent };

/**
 * Splits one read into keys and mouse events, in the order they came. A mouse report that is not
 * of use (a release, a move) is dropped like any sequence we don't know.
 */
export function parseInput(data: string, reading: MouseReading = {}): Input[] {
  return data.split(SPLIT_AT_REPORTS).flatMap((part, index): Input[] => {
    if (index % 2 === 0) return parseKeys(part).map((key) => ({ kind: 'key', key }));

    const mouse = parseMouseReport(part, reading);

    return mouse ? [{ kind: 'mouse', mouse }] : [];
  });
}

/** Splits one read from a raw terminal into keys; an unknown escape sequence is dropped whole. */
export function parseKeys(data: string): Key[] {
  const keys: Key[] = [];
  let index = 0;

  while (index < data.length) {
    const rest = data.slice(index);
    const escape = Object.keys(ESCAPES).find((sequence) => rest.startsWith(sequence));

    if (escape) {
      keys.push(ESCAPES[escape] as Key);
      index += escape.length;
      continue;
    }

    const modified = consumeModified(rest);

    if (modified) {
      keys.push(modified.key);
      index += modified.length;
      continue;
    }

    const consumed = consumeOne(rest);

    if (consumed.key) keys.push(consumed.key);

    index += consumed.length;
  }

  return keys;
}

function consumeOne(rest: string): { key?: Key; length: number } {
  const first = rest[0] as string;

  if (first === '\u001b') return consumeEscape(rest);

  if (first === '\r' || first === '\n') return { key: 'enter', length: 1 };

  if (first === '\u007f' || first === '\b') return { key: 'backspace', length: 1 };

  const codePoint = rest.codePointAt(0) as number;
  const length = codePoint > 0xffff ? 2 : 1;

  // Ctrl+a to Ctrl+z arrive as the codes 1 to 26; Tab (9) is not one a program here uses.
  if (codePoint >= 1 && codePoint <= 26 && codePoint !== 9) {
    return { key: `ctrl+${String.fromCharCode(codePoint + 96)}`, length };
  }

  return codePoint < 0x20 ? { length } : { key: rest.slice(0, length), length };
}

const MODIFIED_FINAL: Record<string, string> = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
};
const MODIFIED_TILDE: Record<string, string> = { '3': 'delete', '5': 'pageup', '6': 'pagedown' };

/** The key a modified sequence is for: an arrow (`1;5C`), or Page and Delete (`5;5~`). */
function modifiedBase(params: { final: string; number: string }): string | undefined {
  if (params.final === '~') return MODIFIED_TILDE[params.number];

  return params.number === '1' ? MODIFIED_FINAL[params.final] : undefined;
}

/**
 * An arrow, Page or Delete key with Shift, Alt or Ctrl held: `ESC [ 1 ; 5 C` for Ctrl+Right,
 * `ESC [ 5 ; 2 ~` for Shift+PageUp. The name lists the modifiers first: `ctrl+right`.
 */
function consumeModified(rest: string): { key: Key; length: number } | undefined {
  const match = /^\u001b\[(\d+);(\d+)([A-D~])/.exec(rest);

  if (!match) return undefined;

  const [whole, number, modifier, final] = match as unknown as [string, string, string, string];
  const base = modifiedBase({ final, number });
  const bits = Number(modifier) - 1;

  // Meta (8) is what some terminals call Alt; it is the same key to us.
  const names = [
    bits & 2 || bits & 8 ? 'alt+' : '',
    bits & 4 ? 'ctrl+' : '',
    bits & 1 ? 'shift+' : '',
  ];

  // A key we don't know is dropped whole, like any other sequence we don't know.
  return base ? { key: `${names.join('')}${base}`, length: whole.length } : undefined;
}

/**
 * A lone Escape is the key; Escape followed by `[` or `O` and more starts a sequence we don't know.
 * Escape followed by anything else is how a terminal sends Alt+key: one key (`alt+f`) that nothing
 * here handles, not an Escape and then a letter, which would press the letter's own command. The
 * two that begin a sequence are Alt+key too when nothing follows them (`alt+[`, `alt+O`).
 */
function consumeEscape(rest: string): { key?: Key; length: number } {
  if (rest.length === 1) return { key: 'escape', length: 1 };

  if (rest.length === 2 && (rest[1] === '[' || rest[1] === 'O')) {
    return { key: `alt+${rest[1]}`, length: 2 };
  }

  if (rest[1] !== '[' && rest[1] !== 'O') {
    const length = (rest.codePointAt(1) as number) > 0xffff ? 3 : 2;

    return { key: `alt+${rest.slice(1, length)}`, length };
  }

  const end = rest.slice(2).search(/[\u0040-\u007e]/);

  return { length: end === -1 ? rest.length : end + 3 };
}
