/**
 * How wide text is on a terminal, in columns, which is not how many characters it has: a Chinese
 * character or an emoji takes two, an accent that follows a letter takes none. Counting characters
 * makes a row with such text longer than its screen, and the divider and everything to the right of
 * it move. The table is an approximation of `wcwidth`: characters whose width depends on the
 * terminal's font or locale (the "ambiguous" ones, such as `│` and `↑`) count as one.
 */

type Range = readonly [from: number, to: number];

/** Marks that sit on the character before them, and invisible ones: no column of their own. */
const ZERO_WIDTH: readonly Range[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xfeff, 0xfeff],
  [0xe0100, 0xe01ef],
];

/** East Asian wide and fullwidth characters, and the emoji that are drawn two columns wide. */
const WIDE: readonly Range[] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const PLAIN_ASCII = /^[\u0020-\u007e]*$/;
const ELLIPSIS = '…';
/** Asks for the emoji look of a character that has a text look too, which is two columns. */
const EMOJI_PRESENTATION = '\ufe0f';

const inRanges = (codePoint: number, ranges: readonly Range[]): boolean =>
  ranges.some(([from, to]) => codePoint >= from && codePoint <= to);

function charWidth(codePoint: number): number {
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;

  if (inRanges(codePoint, ZERO_WIDTH)) return 0;

  return inRanges(codePoint, WIDE) ? 2 : 1;
}

/** The columns of one user-perceived character (a letter with its accents, an emoji sequence). */
function graphemeWidth(grapheme: string): number {
  if (grapheme.includes(EMOJI_PRESENTATION)) return 2;

  let width = 0;

  for (const character of grapheme) {
    width = Math.max(width, charWidth(character.codePointAt(0) as number));
  }

  return width;
}

/** How many columns the text takes up. It holds no escape sequences: take those out first. */
export function displayWidth(text: string): number {
  if (PLAIN_ASCII.test(text)) return text.length;

  let width = 0;

  for (const { segment } of GRAPHEMES.segment(text)) width += graphemeWidth(segment);

  return width;
}

/**
 * The part of the text that is in columns `from` to `from + columns`. A wide character that is
 * cut by an edge of that range is not shown half: its columns that are inside are blank.
 */
export function sliceColumns(text: string, from: number, columns: number): string {
  if (PLAIN_ASCII.test(text)) return text.slice(from, from + columns);

  const end = from + columns;
  let position = 0;
  let out = '';

  for (const { segment } of GRAPHEMES.segment(text)) {
    const width = graphemeWidth(segment);
    const inside = Math.min(position + width, end) - Math.max(position, from);

    if (width === 0) {
      if (position >= from && position < end) out += segment;
    } else if (inside === width) {
      out += segment;
    } else if (inside > 0) {
      out += ' '.repeat(inside);
    }

    position += width;

    if (position >= end) break;
  }

  return out;
}

/** The first `columns` columns of the text. */
export function takeColumns(text: string, columns: number): string {
  return sliceColumns(text, 0, columns);
}

/** The last `columns` columns of the text: the end of what is being typed, which holds the cursor. */
export function takeLastColumns(text: string, columns: number): string {
  return sliceColumns(text, Math.max(0, displayWidth(text) - columns), columns);
}

/** The text cut to `columns` columns, with `…` where it was cut; as it is when it fits. */
export function truncateColumns(text: string, columns: number): string {
  if (columns <= 0) return '';

  if (displayWidth(text) <= columns) return text;

  return fitColumns(`${takeColumns(text, Math.max(0, columns - 1))}${ELLIPSIS}`, columns);
}

/** The text as exactly `columns` columns: cut with `…` when it is long, padded with spaces when short. */
export function fitColumns(text: string, columns: number): string {
  if (columns <= 0) return '';

  const width = displayWidth(text);

  if (width > columns) return truncateColumns(text, columns);

  return text + ' '.repeat(columns - width);
}

/** The text without its last user-perceived character, which is what Backspace takes off. */
export function withoutLastGrapheme(text: string): string {
  const segments = [...GRAPHEMES.segment(text)];

  return segments
    .slice(0, -1)
    .map(({ segment }) => segment)
    .join('');
}
