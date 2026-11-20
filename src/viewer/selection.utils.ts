import { displayWidth } from '../terminal/width.utils.ts';
import { cleanText, type ViewRow } from './diff.ts';

/**
 * A cell of the file: the index of a row of the view and a column of its text, counted from 0 in
 * the text as it is shown (a tab is four columns). Not a place on the screen, so a selection keeps
 * to the text while the view scrolls and pans.
 */
export type Position = { row: number; column: number };

/** What is selected: from where it began to where it is now, which may be before it. */
export type Selection = { anchor: Position; head: Position };

/** Columns a tab takes, as `cleanText` shows it. */
const TAB_COLUMNS = 4;

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const isControl = (code: number): boolean => code < 0x20 || (code >= 0x7f && code < 0xa0);

function ordered(selection: Selection): { start: Position; end: Position } {
  const { anchor, head } = selection;
  const headFirst =
    head.row < anchor.row || (head.row === anchor.row && head.column < anchor.column);

  return headFirst ? { start: head, end: anchor } : { start: anchor, end: head };
}

/**
 * The columns of a row that are selected, `to` not included; the cell under the head is part of
 * it. A row that continues into the next has no end (`Infinity`). Nothing for a row outside.
 */
export function spanOnRow(params: {
  selection: Selection;
  row: number;
}): readonly [from: number, to: number] | undefined {
  const { start, end } = ordered(params.selection);
  const { row } = params;

  if (row < start.row || row > end.row) return undefined;

  return [row === start.row ? start.column : 0, row === end.row ? end.column + 1 : Infinity];
}

/** How many columns a row's text takes as shown. */
export function rowWidth(row: ViewRow): number {
  return displayWidth(cleanText(row.text));
}

/**
 * The text of the columns `from` to `to` of a line, as it is in the file: a tab stays a tab and
 * what `cleanText` drops stays out. A character is in when any of its columns are.
 */
function copiedColumns(params: { text: string; from: number; to: number }): string {
  const { text, from, to } = params;
  let column = 0;
  let out = '';

  for (const { segment } of GRAPHEMES.segment(text)) {
    if (column >= to) break;

    const code = segment.codePointAt(0) as number;

    if (isControl(code) && segment !== '\t') continue;

    const width = segment === '\t' ? TAB_COLUMNS : displayWidth(segment);

    if (column + width > from) out += segment;

    column += width;
  }

  return out;
}

/**
 * The text of a selection, a line to a row. Removed lines are in the view and not in the file, so
 * they are left out, unless the selection is of nothing else.
 */
export function selectedText(params: { rows: ViewRow[]; selection: Selection }): string {
  const { rows, selection } = params;
  const { start, end } = ordered(selection);
  const covered = rows.slice(start.row, end.row + 1);
  const onlyRemoved = covered.every((row) => row.kind === 'removed');
  const lines: string[] = [];

  covered.forEach((row, offset) => {
    if (row.kind === 'removed' && !onlyRemoved) return;

    const span = spanOnRow({ selection, row: start.row + offset }) as readonly [number, number];

    lines.push(copiedColumns({ text: row.text, from: span[0], to: span[1] }));
  });

  return lines.join('\n');
}
