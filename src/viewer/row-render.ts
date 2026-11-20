import { displayWidth, sliceColumns } from '../terminal/width.utils.ts';
import { cleanText, type ViewRow } from './diff.ts';
import { colorCode, type Piece } from './highlight.ts';

const ESC = '\u001b[';

export const style = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  reverse: `${ESC}7m`,
};

/** Subtle 24-bit backgrounds for added and removed lines, for a dark or a light terminal. */
function tintsFor(light: boolean): { added: string; removed: string } {
  return light
    ? { added: `${ESC}48;2;220;244;224m`, removed: `${ESC}48;2;253;226;228m` }
    : { added: `${ESC}48;2;18;54;30m`, removed: `${ESC}48;2;66;26;30m` };
}

/** Puts a background behind a whole row, and back after every reset inside it. */
function tint(line: string, background: string): string {
  return `${background}${line.replaceAll(style.reset, `${style.reset}${background}`)}${style.reset}`;
}

/** The columns of a line that are shown selected, `to` not included. */
type Span = readonly [from: number, to: number];

/** A piece of text cut at the edges of the selection; `start` is the column of its first character. */
function splitSelected(params: {
  text: string;
  start: number;
  selected: Span | undefined;
}): { text: string; on: boolean }[] {
  const { text, start, selected } = params;

  if (!selected) return [{ text, on: false }];

  const width = displayWidth(text);
  const from = Math.max(0, selected[0] - start);
  const to = Math.min(width, selected[1] - start);

  if (from >= to) return [{ text, on: false }];

  return [
    { text: sliceColumns(text, 0, from), on: false },
    { text: sliceColumns(text, from, to - from), on: true },
    { text: sliceColumns(text, to, width - to), on: false },
  ].filter((part) => part.text !== '');
}

/**
 * The part of a line that is in view, padded to `room` columns, with the `selected` columns in
 * reverse. Each part of it ends with a reset, so `base` (a colour for the whole line) starts each
 * one again. The first cell after the text is the line's end, which a selection that goes on to
 * the next line or a cursor on an empty line marks.
 */
export function styledSlice(params: {
  pieces: Piece[];
  left: number;
  room: number;
  base?: string;
  selected?: Span | undefined;
}): string {
  const { pieces, left, room, base = '', selected } = params;
  let skipped = 0;
  let shown = 0;
  let out = '';

  for (const piece of pieces) {
    if (shown >= room) break;

    const text = cleanText(piece.text);
    const from = Math.max(0, left - skipped);
    const take = sliceColumns(text, from, room - shown);
    const start = skipped + from;

    skipped += displayWidth(text);

    if (take === '') continue;

    for (const part of splitSelected({ text: take, start, selected })) {
      out += `${base}${pieceCodes(piece)}${part.on ? style.reverse : ''}${part.text}${style.reset}`;
    }

    shown += displayWidth(take);
  }

  const spare = Math.max(0, room - shown);

  if (spare === 0 || !marksEnd({ selected, end: skipped, left })) return out + ' '.repeat(spare);

  return `${out}${style.reverse} ${style.reset}${' '.repeat(spare - 1)}`;
}

function pieceCodes(piece: Piece): string {
  const color = piece.color ? colorCode(piece.color) : '';

  return `${color}${piece.bold ? '\u001b[1m' : ''}${piece.italic ? '\u001b[3m' : ''}`;
}

/** Whether the cell where the text ends (column `end`) is in view and in the selection. */
function marksEnd(params: { selected: Span | undefined; end: number; left: number }): boolean {
  const { selected, end, left } = params;

  return selected !== undefined && end >= left && selected[0] <= end && end < selected[1];
}

/** What `renderRow` needs besides the row. */
export type RowView = {
  width: number;
  /** Columns of the line numbers. */
  numberWidth: number;
  /** The first column of the text in view. */
  left: number;
  light: boolean;
  /** Colours for each line number, once the highlighter has run; plain text until then. */
  colored: Piece[][] | undefined;
  selected: Span | undefined;
};

/** One row of the view as a line of the screen: its number or mark, then its text. */
export function renderRow(row: ViewRow, view: RowView): string {
  const { width, numberWidth, left, light, colored, selected } = view;
  const room = Math.max(0, width - numberWidth - 3);
  const tints = tintsFor(light);

  if (row.kind === 'removed') {
    const mark = `${style.red}${' '.repeat(numberWidth)} - ${style.reset}`;
    const text = styledSlice({
      pieces: [{ text: row.text, bold: false, italic: false }],
      left,
      room,
      base: style.red,
      selected,
    });

    return tint(`${mark}${text}`, tints.removed);
  }

  const pieces = colored?.[row.number - 1] ?? [{ text: row.text, bold: false, italic: false }];
  const body = styledSlice({ pieces, left, room, selected });
  const number = String(row.number).padStart(numberWidth);

  if (row.added) return tint(`${style.green}${number} +${style.reset} ${body}`, tints.added);

  return `${style.dim}${number}${style.reset}   ${body}`;
}
