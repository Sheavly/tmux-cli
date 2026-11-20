import os from 'node:os';
import path from 'node:path';
import { MOUSE_ALL, type MouseSettings } from '../config/mouse-settings.ts';
import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import { fromTerminal } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { wheelRows, type MouseEvent } from '../terminal/mouse.utils.ts';
import { fitColumns } from '../terminal/width.utils.ts';
import type { Tmux } from '../tmux/tmux.ts';
import { startFullScreen } from '../sidebar/full-screen.ts';
import { hintKey } from '../sidebar/help.ts';
import type { Key } from '../sidebar/keys.ts';
import { paint, screenCodes, shortPath, truncate } from '../sidebar/render.ts';
import { copyToClipboard } from './clipboard.ts';
import { changeStarts } from './diff.ts';
import { loadFile } from './file-load.ts';
import {
  highlight,
  isLight,
  recordedBackground,
  MAX_HIGHLIGHT_LINES,
  type Piece,
} from './highlight.ts';
import { renderRow, style } from './row-render.ts';
import type { Position } from './selection.utils.ts';
import { createSelecting } from './selecting.ts';

const PAN_STEP = 8;

/**
 * A read-only view of one file with its uncommitted changes marked; Esc closes it. Text is
 * selected with the mouse or in a copy mode, and copied through `tmux`, as in a chat.
 */
export async function runViewer(params: {
  file: string;
  tmux: Tmux;
  /** Which keys do what; the defaults when not given. */
  bindings?: Bindings;
  /** What the mouse may do; all of it when not given. */
  mouse?: MouseSettings;
}): Promise<never> {
  const { bindings = defaultBindings(), mouse = MOUSE_ALL } = params;
  const hint = (id: ActionId): string => hintKey(bindings, id);
  const file = path.resolve(params.file);
  const loaded = await loadFile(file);
  const { rows } = loaded;
  const starts = changeStarts(rows);
  const numberWidth = String(
    rows.reduce((max, row) => (row.kind === 'line' ? row.number : max), 0),
  ).length;
  let top = 0;
  let left = 0;
  // Where the last jump between changes landed, so `n` and `p` go on from there.
  let anchor = -1;
  // Colours for each line number, once the highlighter has run; plain text until then.
  let colored: Piece[][] | undefined;
  // Whether the terminal is light, which picks the shade of the changed lines' backgrounds.
  let light = false;

  const bodyHeight = (): number => Math.max(1, process.stdout.rows - 2);
  const maxTop = (): number => Math.max(0, rows.length - bodyHeight());

  function scroll(delta: number): void {
    top = Math.min(Math.max(top + delta, 0), maxTop());
    anchor = top;
    draw();
  }

  function jump(direction: 1 | -1): void {
    const target =
      direction === 1
        ? starts.find((start) => start > anchor)
        : starts.findLast((start) => start < anchor);

    if (target === undefined) return;

    anchor = target;
    top = Math.min(Math.max(target - 2, 0), maxTop());
    draw();
  }

  function wheel(event: MouseEvent): void {
    const rowsMoved = wheelRows(event);

    if (rowsMoved !== 0) scroll(rowsMoved);
  }

  function pan(delta: number): void {
    left = Math.max(0, left + delta);
    draw();
  }

  // The columns in front of the text of a row: the number, a mark and a space either side of it.
  const gutter = numberWidth + 3;
  // What the last copy did, in place of the key help until the next key or click.
  let notice: string | undefined;

  /** Scrolls and pans as little as it takes to show a cell; the caller draws. */
  function reveal(position: Position): void {
    const room = Math.max(1, process.stdout.columns - gutter);

    if (position.row < top) top = position.row;
    else if (position.row >= top + bodyHeight()) top = position.row - bodyHeight() + 1;

    if (position.column < left) left = position.column;
    else if (position.column >= left + room) left = position.column - room + 1;
  }

  async function copyText(text: string): Promise<void> {
    const count = text.split('\n').length;

    try {
      await copyToClipboard({ tmux: params.tmux, text });
      notice = `copied ${count} ${count === 1 ? 'line' : 'lines'}`;
    } catch (caughtError) {
      notice = `copy failed: ${(caughtError as Error).message}`;
    }

    draw();
  }

  const selecting = createSelecting({
    rows,
    bindings,
    view: {
      top: () => top,
      left: () => left,
      bodyHeight,
      gutter,
      reveal,
      scroll: (delta) => {
        scroll(delta);
      },
    },
    copy: copyText,
    redraw: () => {
      draw();
    },
  });

  /** What the footer says the keys do; a key that is not bound is left out. */
  function helpText(): string {
    const hints = selecting.inCopyMode()
      ? [
          [hint('copyMode.copy'), 'copy'],
          [hint('copyMode.escape'), 'drop selection, then leave'],
          [hint('copyMode.quit'), 'leave'],
        ]
      : [
          [`${hint('viewer.scrollUp')}${hint('viewer.scrollDown')}`, 'scroll'],
          [`${hint('viewer.panLeft')}${hint('viewer.panRight')}`, 'pan'],
          [`${hint('viewer.nextChange')}/${hint('viewer.previousChange')}`, 'change'],
          [hint('viewer.copyMode'), 'copy mode'],
          [hint('viewer.close'), 'close'],
        ];

    return hints
      .filter(([keys]) => keys !== '' && keys !== '/')
      .map(([keys, text]) => `${keys} ${text}`)
      .join('  ');
  }

  function draw(): void {
    const { columns: width, rows: height } = process.stdout;
    const stats = loaded.note ? loaded.note : `+${loaded.added} −${loaded.removed}`;
    const title = fitColumns(
      ` ${shortPath({ path: file, home: os.homedir(), max: width - stats.length - 6 })}  ${stats}`,
      width,
    );
    const body = rows.slice(top, top + bodyHeight()).map((row, offset) =>
      renderRow(row, {
        width,
        numberWidth,
        left,
        light,
        colored,
        selected: selecting.spanOn(top + offset),
      }),
    );
    const filler = Array.from({ length: Math.max(0, bodyHeight() - body.length) }, () =>
      ' '.repeat(width),
    );
    const position = rows.length === 0 ? '' : `${Math.min(top + 1, rows.length)}/${rows.length}`;
    const footer = fitColumns(
      truncate(` ${notice ?? helpText()}`, Math.max(0, width - position.length - 1)),
      width - position.length - 1,
    );
    const message = rows.length === 0 ? fitColumns(` ${loaded.note}`, width) : undefined;
    const lines = [
      `${style.bold}${title}${style.reset}`,
      ...(message ? [message] : body),
      ...(message
        ? Array.from({ length: Math.max(0, bodyHeight() - 1) }, () => ' '.repeat(width))
        : filler),
      `${style.reverse}${footer} ${position}${style.reset}`,
    ].slice(0, height);

    process.stdout.write(paint(lines));
  }

  const actions: Partial<Record<ActionId, () => void>> = {
    'viewer.close': () => process.exit(0),
    'viewer.scrollUp': () => {
      scroll(-1);
    },
    'viewer.scrollDown': () => {
      scroll(1);
    },
    'viewer.pageUp': () => {
      scroll(-bodyHeight());
    },
    'viewer.pageDown': () => {
      scroll(bodyHeight());
    },
    'viewer.top': () => {
      scroll(-Infinity);
    },
    'viewer.bottom': () => {
      scroll(Infinity);
    },
    'viewer.panLeft': () => {
      pan(-PAN_STEP);
    },
    'viewer.panRight': () => {
      pan(PAN_STEP);
    },
    'viewer.nextChange': () => {
      jump(1);
    },
    'viewer.previousChange': () => {
      jump(-1);
    },
    // With our copy mode keys turned off there would be no way to copy or to leave it.
    'viewer.copyMode': () => {
      if (bindings.copyMode) selecting.enterCopyMode();
    },
  };

  async function handleKey(key: Key): Promise<void> {
    const name = fromTerminal(key) ?? '';

    notice = undefined;

    if (await selecting.key(name)) return;

    const action = bindings.action('viewer', name);

    if (action) actions[action]?.();
  }

  async function handleMouse(event: MouseEvent): Promise<void> {
    notice = undefined;

    if (event.kind === 'wheelUp' || event.kind === 'wheelDown') {
      if (mouse.scroll) wheel(event);

      return;
    }

    if (mouse.copy) await selecting.mouse(event);
  }

  startFullScreen({
    onKey: handleKey,
    ...(mouse.scroll || mouse.copy ? { onMouse: handleMouse, drag: mouse.copy } : {}),
    onResize: () => {
      process.stdout.write(screenCodes.clear);
      draw();
    },
  });

  // Open at the first change, with a little of what comes before it.
  if (starts[0] !== undefined) {
    anchor = starts[0];
    top = Math.min(Math.max(starts[0] - 3, 0), maxTop());
  }

  draw();

  // The file is on screen already; the colours follow once the highlighter has loaded.
  const code = rows.filter((row) => row.kind === 'line').map((row) => row.text);

  if (code.length > 0 && code.length <= MAX_HIGHLIGHT_LINES) {
    const background = await recordedBackground();

    light = isLight(background);
    // Redrawn first so the tints are right even while the highlighter is still loading.
    draw();
    colored = await highlight({ file, code: code.join('\n'), light });
    draw();
  }

  return new Promise<never>(() => undefined);
}
