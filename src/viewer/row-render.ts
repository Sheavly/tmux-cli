import { displayWidth, sliceColumns } from '../terminal/width.utils.ts';
import { cleanText } from './diff.ts';
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
export function tintsFor(light: boolean): { added: string; removed: string } {
  return light
    ? { added: `${ESC}48;2;220;244;224m`, removed: `${ESC}48;2;253;226;228m` }
    : { added: `${ESC}48;2;18;54;30m`, removed: `${ESC}48;2;66;26;30m` };
}

/** Puts a background behind a whole row, and back after every reset inside it. */
export function tint(line: string, background: string): string {
  return `${background}${line.replaceAll(style.reset, `${style.reset}${background}`)}${style.reset}`;
}

/** The columns `left` to `left + room` of a line of the file, without control characters. */
export function plainSlice(text: string, left: number, room: number): string {
  return sliceColumns(cleanText(text), left, room);
}

/** The part of a coloured line that is in view, padded to `room` columns. */
export function styledSlice(params: { pieces: Piece[]; left: number; room: number }): string {
  const { pieces, left, room } = params;
  let skipped = 0;
  let shown = 0;
  let out = '';

  for (const piece of pieces) {
    if (shown >= room) break;

    const text = cleanText(piece.text);
    const take = sliceColumns(text, Math.max(0, left - skipped), room - shown);

    skipped += displayWidth(text);

    if (take === '') continue;

    const codes = `${piece.color ? colorCode(piece.color) : ''}${piece.bold ? '\u001b[1m' : ''}${piece.italic ? '\u001b[3m' : ''}`;

    out += `${codes}${take}${style.reset}`;
    shown += displayWidth(take);
  }

  return out + ' '.repeat(Math.max(0, room - shown));
}
