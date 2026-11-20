import { displayWidth } from '../terminal/width.utils.ts';
import { cleanText, type ViewRow } from './diff.ts';
import { rowWidth, type Position } from './selection.utils.ts';

/** Where the cursor of copy mode can go. */
export type Move =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'pageUp'
  | 'pageDown'
  | 'top'
  | 'bottom'
  | 'wordPrevious'
  | 'wordNext';

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WORD = /^[\p{L}\p{N}_]/u;

type Cell = { text: string; start: number };

function cellsOf(text: string): Cell[] {
  const cells: Cell[] = [];
  let start = 0;

  for (const { segment } of GRAPHEMES.segment(cleanText(text))) {
    cells.push({ text: segment, start });
    start += displayWidth(segment);
  }

  return cells;
}

/** The column where the word before `column` starts, or none when the line has no word there. */
function wordStartBefore(text: string, column: number): number | undefined {
  const cells = cellsOf(text).filter((cell) => cell.start < column);
  let index = cells.length - 1;

  while (index >= 0 && !WORD.test((cells[index] as Cell).text)) index--;

  if (index < 0) return undefined;

  while (index > 0 && WORD.test((cells[index - 1] as Cell).text)) index--;

  return (cells[index] as Cell).start;
}

/** The column of the last cell of the word after `column`, or none when the line has no word there. */
function wordEndAfter(text: string, column: number): number | undefined {
  const cells = cellsOf(text).filter((cell) => cell.start > column);
  let index = 0;

  while (index < cells.length && !WORD.test((cells[index] as Cell).text)) index++;

  if (index >= cells.length) return undefined;

  while (index + 1 < cells.length && WORD.test((cells[index + 1] as Cell).text)) index++;

  return (cells[index] as Cell).start;
}

const lastColumn = (row: ViewRow | undefined): number => Math.max(0, rowWidth(row as ViewRow) - 1);

/** A word move that finds none in the line goes on to the end of the line before or the start of the next. */
function wordMove(params: { rows: ViewRow[]; cursor: Position; forward: boolean }): Position {
  const { rows, cursor, forward } = params;
  const text = (rows[cursor.row] as ViewRow).text;
  const column = forward ? wordEndAfter(text, cursor.column) : wordStartBefore(text, cursor.column);

  if (column !== undefined) return { row: cursor.row, column };

  const row = cursor.row + (forward ? 1 : -1);

  if (row < 0 || row >= rows.length) return cursor;

  return { row, column: forward ? 0 : lastColumn(rows[row]) };
}

function rowMove(params: { rows: ViewRow[]; cursor: Position; move: Move; page: number }): number {
  const { rows, cursor, move, page } = params;
  const deltas: Partial<Record<Move, number>> = {
    up: -1,
    down: 1,
    pageUp: -page,
    pageDown: page,
    top: -Infinity,
    bottom: Infinity,
  };

  return Math.min(Math.max(cursor.row + (deltas[move] ?? 0), 0), rows.length - 1);
}

/**
 * Where the cursor is after a move, always on a row of the view and in a column of its text. It
 * stays where it is at an edge. `page` is how many rows a page is.
 */
export function movedCursor(params: {
  rows: ViewRow[];
  cursor: Position;
  move: Move;
  page: number;
}): Position {
  const { rows, cursor, move } = params;

  if (move === 'wordPrevious' || move === 'wordNext') {
    return wordMove({ rows, cursor, forward: move === 'wordNext' });
  }

  if (move === 'left' || move === 'right') {
    const column = cursor.column + (move === 'right' ? 1 : -1);

    return { row: cursor.row, column: Math.min(Math.max(column, 0), lastColumn(rows[cursor.row])) };
  }

  const row = rowMove(params);

  return { row, column: Math.min(cursor.column, lastColumn(rows[row])) };
}
