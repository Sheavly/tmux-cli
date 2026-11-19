import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import { fromTerminal } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { LINES_PANE_OPTION } from '../session/panes.ts';
import { fitColumns } from '../terminal/width.utils.ts';
import { startFullScreen } from '../sidebar/full-screen.ts';
import { hints as hintsFor } from '../sidebar/help.ts';
import type { Key } from '../sidebar/keys.ts';
import { paint, screenCodes } from '../sidebar/render.ts';
import { fitStyled, keepStyles, reverseAll, stripEscapes } from '../terminal/ansi.ts';
import type { Tmux } from '../tmux/tmux.ts';
import { cleanText } from '../viewer/diff.ts';

const MAX_DIGITS = 7;

const ESC = '\u001b[';
const style = { reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, reverse: `${ESC}7m` };

/** A chat's rows from the top of its history to the bottom of its screen. */
export type Snapshot = {
  /** Each row as plain text: what is searched, counted and handed to the adapter. */
  rows: string[];
  /** The same rows with their colours, as they are shown in the popup. */
  styled: string[];
  /** Empty rows at the bottom: the screen below the newest line, which is not a line. */
  blank: number;
  /** Rows above those that are the program's own controls (input box, status), not conversation. */
  chrome: number;
};

/**
 * Reads `capture-pane` output (with `-e`, so with colours): one row per screen row, the way the
 * chat shows it wrapped. `chromeRows` is the harness adapter's way of telling the conversation
 * from the controls under it. Output without colours reads the same way.
 */
export function parseCapture(
  text: string,
  chromeRows?: (rows: readonly string[]) => number,
): Snapshot {
  const raw = text.split('\n');

  // The output ends with a newline, which is not a row of its own.
  if (raw.at(-1) === '') raw.pop();

  const rows = raw.map((row) => cleanText(stripEscapes(row)));
  const styled = raw.map(keepStyles);

  let blank = 0;

  while (blank < rows.length && (rows[rows.length - 1 - blank] as string).trim() === '') blank++;

  const chrome = chromeRows ? chromeRows(rows.slice(0, rows.length - blank)) : 0;

  return { rows, styled, blank, chrome: Math.max(0, Math.min(chrome, rows.length - blank)) };
}

/** The rows that count as lines. */
export function lineCount(snapshot: Snapshot): number {
  return snapshot.rows.length - snapshot.blank - snapshot.chrome;
}

/**
 * How many rows up from the bottom of the chat's screen a line is now. The newest line is 0,
 * `below` is how many rows under it are not lines, and `total` is how many rows the snapshot had;
 * the chat may have printed more since, which moves every line further up, and that is what
 * `currentTotal` is for.
 */
export function jumpDistance(params: {
  total: number;
  below: number;
  line: number;
  currentTotal: number;
}): number {
  const { total, below, line, currentTotal } = params;

  return Math.max(0, currentTotal - total + below + line);
}

/** Gives the keyboard to the sidebar, the pane beside the chat in its window. */
export async function focusSidebar(params: { tmux: Tmux; pane: string }): Promise<void> {
  const { tmux, pane } = params;
  const panes = await tmux.run(['list-panes', '-t', pane, '-F', '#{pane_id} #{@sheavly_role}']);
  const sidebar = panes
    .split('\n')
    .map((line) => line.trim().split(' '))
    .find(([, role]) => role === 'sidebar')?.[0];

  // The sidebar is always to the left of the chat, which is the way to it if the tag is missing.
  if (sidebar) await tmux.run(['select-pane', '-t', sidebar]);
  else await tmux.run(['select-pane', '-L', '-t', pane]);
}

async function sizeOf(tmux: Tmux, pane: string): Promise<number> {
  const out = await tmux.run([
    'display-message',
    '-p',
    '-t',
    pane,
    '#{history_size} #{pane_height}',
  ]);
  const [history = 0, height = 0] = out.trim().split(' ').map(Number);

  return history + height;
}

/**
 * Puts the pane in copy mode with its cursor at the start of a line of the snapshot, and scrolls
 * the line to the middle of the pane where there is enough history on both sides for that.
 */
export async function jumpTo(params: {
  tmux: Tmux;
  pane: string;
  snapshot: Snapshot;
  line: number;
}): Promise<void> {
  const { tmux, pane, snapshot, line } = params;
  const distance = jumpDistance({
    total: snapshot.rows.length,
    below: snapshot.blank + snapshot.chrome,
    line,
    currentTotal: await sizeOf(tmux, pane),
  });

  await tmux.run(['copy-mode', '-t', pane]);
  await tmux.run(['send-keys', '-t', pane, '-X', 'clear-selection']);
  await tmux.run(['send-keys', '-t', pane, '-X', 'history-bottom']);

  if (distance > 0) {
    await tmux.run(['send-keys', '-t', pane, '-N', String(distance), '-X', 'cursor-up']);
  }

  await tmux.run(['send-keys', '-t', pane, '-X', 'start-of-line']);
  await tmux.run(['send-keys', '-t', pane, '-X', 'scroll-middle']);
}

/** The pane's rows from the top of its history to the bottom of its screen, controls marked. */
async function captureSnapshot(params: {
  tmux: Tmux;
  pane: string;
  chromeRows?: ((rows: readonly string[]) => number) | undefined;
}): Promise<Snapshot> {
  const { tmux, pane, chromeRows } = params;

  return parseCapture(
    await tmux.run(['capture-pane', '-p', '-e', '-t', pane, '-S', '-', '-E', '-']),
    chromeRows,
  );
}

/**
 * Enters copy mode with the cursor at the start of the newest line of the conversation: line 0,
 * the same place Alt+g lands on for 0, so the controls under it are skipped. A chat with no lines
 * yet just gets copy mode.
 */
export async function copyAtNewest(params: {
  tmux: Tmux;
  pane: string;
  chromeRows?: ((rows: readonly string[]) => number) | undefined;
}): Promise<void> {
  const { tmux, pane } = params;
  const snapshot = await captureSnapshot(params);

  if (lineCount(snapshot) === 0) await tmux.run(['copy-mode', '-t', pane]);
  else await jumpTo({ tmux, pane, snapshot, line: 0 });
}

/**
 * The chat's lines, numbered from the newest (0) upward, over the whole screen. Type a number and
 * press Enter and the chat is left in copy mode with the cursor at the start of that line, where
 * tmux's own keys take over: arrows, word jumps, selecting and copying.
 */
export async function runLines(params: {
  tmux: Tmux;
  pane: string;
  /** From the harness adapter: how many bottom rows are the chat program's own controls. */
  chromeRows?: (rows: readonly string[]) => number;
  /** Which keys do what; the defaults when not given. */
  bindings?: Bindings;
}): Promise<never> {
  const { tmux, bindings = defaultBindings() } = params;
  const hints = (parts: [ActionId[], string][]): string => hintsFor(bindings, parts);
  const pane = params.pane || (await tmux.run(['show-options', '-gqv', LINES_PANE_OPTION])).trim();

  if (!pane) throw new Error('No chat to show.');

  const snapshot = await captureSnapshot({ tmux, pane, chromeRows: params.chromeRows });
  const shown = lineCount(snapshot);
  const numberWidth = String(Math.max(0, shown - 1)).length;
  let typed = '';
  let message = '';
  let top = 0;

  const bodyHeight = (): number => Math.max(1, process.stdout.rows - 2);
  const maxTop = (): number => Math.max(0, shown - bodyHeight());
  const lineAt = (index: number): number => shown - 1 - index;
  const target = (): number | undefined =>
    typed !== '' && Number(typed) <= shown - 1 ? Number(typed) : undefined;

  top = maxTop();

  function scrollTo(next: number): void {
    top = Math.min(Math.max(next, 0), maxTop());
  }

  /** Brings the row being typed into view, near the middle when it was out of sight. */
  function showTarget(): void {
    const line = target();

    if (line === undefined) return;

    const index = shown - 1 - line;

    if (index < top || index >= top + bodyHeight()) scrollTo(index - Math.floor(bodyHeight() / 2));
  }

  function draw(): void {
    const { columns: width, rows: height } = process.stdout;
    const goal = target();
    const title = `${style.bold}${fitColumns(' Chat lines (0 is the newest)', width)}${style.reset}`;
    const body = Array.from({ length: bodyHeight() }, (_, offset) => {
      const index = top + offset;

      if (index >= shown) return ' '.repeat(width);

      const number = lineAt(index);
      const label = `${String(number).padStart(numberWidth)} │ `;
      // The row keeps the chat's own colours, fitted to what is left of the width.
      const text = fitStyled(snapshot.styled[index] as string, Math.max(0, width - label.length));

      // The one being typed is in reverse video, its colours reversed with it.
      if (number === goal) return `${style.reverse}${label}${reverseAll(text)}${style.reset}`;

      return `${style.dim}${label}${style.reset}${text}`;
    });
    const footer = `${style.reverse}${fitColumns(footerText(), width)}${style.reset}`;

    process.stdout.write(paint([title, ...body, footer].slice(0, height)));
  }

  function footerText(): string {
    if (typed !== '') {
      const choices = hints([
        [['popup.jump'], 'jump'],
        [['popup.cancel'], 'clear'],
      ]);

      return ` go to: ${typed}_  ${choices}${message ? `  ${message}` : ''}`;
    }

    const cancel = hints([[['popup.cancel'], 'cancel']]);

    if (shown === 0) return ` Nothing to show.  ${cancel}`;

    const scroll = hints([[['popup.scrollUp', 'popup.scrollDown'], 'scroll']]);

    return ` type a line number  ${scroll}  ${cancel}`;
  }

  /** The key that opened the popup closes it; the key that switches panes closes it and goes to the sidebar. */
  async function leaveIfAsked(action: ActionId | undefined): Promise<void> {
    if (action === 'global.copyLines') process.exit(0);

    if (action !== 'global.togglePane') return;

    await focusSidebar({ tmux, pane });
    process.exit(0);
  }

  /** Where the top row goes for a scroll key, or nothing when the key does not scroll. */
  function scrollTarget(action: ActionId | undefined): number | undefined {
    switch (action) {
      case 'popup.scrollUp':
        return top - 1;
      case 'popup.scrollDown':
        return top + 1;
      case 'popup.pageUp':
        return top - bodyHeight();
      case 'popup.pageDown':
        return top + bodyHeight();
      default:
        return undefined;
    }
  }

  async function jump(): Promise<void> {
    const line = target();

    if (typed === '') {
      message = '';
    } else if (line === undefined) {
      message = `no line ${typed} (0 to ${Math.max(0, shown - 1)})`;
    } else {
      await jumpTo({ tmux, pane, snapshot, line });
      process.exit(0);
    }
  }

  async function act(action: ActionId | undefined): Promise<void> {
    const scrolled = scrollTarget(action);

    if (scrolled !== undefined) {
      scrollTo(scrolled);

      return;
    }

    if (action === 'popup.erase') {
      typed = typed.slice(0, -1);
      showTarget();
    } else if (action === 'popup.cancel') {
      if (typed === '') process.exit(0);

      typed = '';
    } else if (action === 'popup.jump') {
      await jump();
    }
  }

  async function handleKey(key: Key): Promise<void> {
    message = '';

    // While a popup is open tmux hands every key to it, so the session's bindings never see these.
    const action = bindings.action('popup', fromTerminal(key) ?? '');

    await leaveIfAsked(action);

    if (/^[0-9]$/.test(key)) {
      if (typed.length < MAX_DIGITS) typed += key;

      showTarget();
    } else {
      await act(action);
    }

    draw();
  }

  startFullScreen({
    onKey: handleKey,
    onResize: () => {
      process.stdout.write(screenCodes.clear);
      draw();
    },
  });
  draw();
  await new Promise<never>(() => undefined);

  throw new Error('unreachable');
}
