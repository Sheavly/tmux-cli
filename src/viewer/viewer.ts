import os from 'node:os';
import path from 'node:path';
import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import { fromTerminal } from '../keys/key.ts';
import type { ActionId } from '../keys/registry.ts';
import { fitColumns } from '../terminal/width.utils.ts';
import { startFullScreen } from '../sidebar/full-screen.ts';
import { hintKey } from '../sidebar/help.ts';
import type { Key } from '../sidebar/keys.ts';
import { paint, screenCodes, shortPath, truncate } from '../sidebar/render.ts';
import { changeStarts, type ViewRow } from './diff.ts';
import { loadFile } from './file-load.ts';
import {
  highlight,
  isLight,
  recordedBackground,
  MAX_HIGHLIGHT_LINES,
  type Piece,
} from './highlight.ts';
import { plainSlice, style, styledSlice, tint, tintsFor } from './row-render.ts';

const PAN_STEP = 8;

/** A read-only view of one file with its uncommitted changes marked; Esc closes it. */
export async function runViewer(params: {
  file: string;
  /** Which keys do what; the defaults when not given. */
  bindings?: Bindings;
}): Promise<never> {
  const { bindings = defaultBindings() } = params;
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

  function pan(delta: number): void {
    left = Math.max(0, left + delta);
    draw();
  }

  function renderRow(row: ViewRow, width: number): string {
    const room = Math.max(0, width - numberWidth - 3);
    const tints = tintsFor(light);

    if (row.kind === 'removed') {
      const text = plainSlice(row.text, left, room);

      return tint(
        `${style.red}${' '.repeat(numberWidth)} - ${fitColumns(text, room)}${style.reset}`,
        tints.removed,
      );
    }

    const pieces = colored?.[row.number - 1];
    const body = pieces
      ? styledSlice({ pieces, left, room })
      : fitColumns(plainSlice(row.text, left, room), room);
    const number = String(row.number).padStart(numberWidth);

    if (row.added) return tint(`${style.green}${number} +${style.reset} ${body}`, tints.added);

    return `${style.dim}${number}${style.reset}   ${body}`;
  }

  /** What the footer says the keys do; a key that is not bound is left out. */
  function helpText(): string {
    return [
      [`${hint('viewer.scrollUp')}${hint('viewer.scrollDown')}`, 'scroll'],
      [`${hint('viewer.panLeft')}${hint('viewer.panRight')}`, 'pan'],
      [`${hint('viewer.nextChange')}/${hint('viewer.previousChange')}`, 'change'],
      [hint('viewer.close'), 'close'],
    ]
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
    const body = rows.slice(top, top + bodyHeight()).map((row) => renderRow(row, width));
    const filler = Array.from({ length: Math.max(0, bodyHeight() - body.length) }, () =>
      ' '.repeat(width),
    );
    const position = rows.length === 0 ? '' : `${Math.min(top + 1, rows.length)}/${rows.length}`;
    const footer = fitColumns(
      truncate(` ${helpText()}`, Math.max(0, width - position.length - 1)),
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
  };

  function handleKey(key: Key): void {
    const action = bindings.action('viewer', fromTerminal(key) ?? '');

    if (action) actions[action]?.();
  }

  startFullScreen({
    onKey: handleKey,
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
