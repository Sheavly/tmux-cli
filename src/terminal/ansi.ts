import { displayWidth, takeColumns } from './width.utils.ts';

const ESC = '\u001b';
const RESET = `${ESC}[0m`;
const REVERSE = `${ESC}[7m`;

// Any CSI sequence (`ESC [ ... final`), and the operating-system ones (`ESC ] ... BEL` or `ESC \`).
const CSI = /\u001b\[[0-9;:?<=>]*[ -/]*[@-~]/g;
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
/** The same CSI pattern as a splitter that keeps what it splits on. */
const CSI_SPLIT = /(\u001b\[[0-9;:?<=>]*[ -/]*[@-~])/;
const SGR = /^\u001b\[[0-9;:]*m$/;

/** Text with every escape sequence taken out: what is actually written on the screen. */
export function stripEscapes(text: string): string {
  return text.replace(OSC, '').replace(CSI, '');
}

/** Control characters and tabs in text that is not an escape sequence: unsafe to print as they are. */
function plainText(text: string): string {
  return text.replaceAll('\t', '    ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

/**
 * Keeps the colours and weights (SGR sequences) and drops everything else that could move the
 * cursor or change the terminal: other escape sequences, control characters.
 */
export function keepStyles(text: string): string {
  return text
    .replace(OSC, '')
    .split(CSI_SPLIT)
    .map((part, index) => {
      // Odd parts are the sequences the split kept; the rest is text.
      if (index % 2 === 1) return SGR.test(part) ? part : '';

      return plainText(part);
    })
    .join('');
}

/** How many columns the text takes up, not counting its sequences (a character is one column). */
export function visibleLength(text: string): number {
  return displayWidth(stripEscapes(text));
}

/**
 * The first `columns` columns of the text with its sequences kept, so what is cut off does not
 * take its colours with it. A style that is still on when the cut is made is switched off.
 */
function take(text: string, columns: number): string {
  let left = columns;
  let out = '';

  for (const [index, part] of text.split(CSI_SPLIT).entries()) {
    if (index % 2 === 1) {
      out += part;
      continue;
    }

    const taken = takeColumns(part, left);

    out += taken;
    left -= displayWidth(taken);
  }

  return out;
}

/**
 * The text as exactly `columns` columns: padded with spaces when it is short, cut with a `…` at the
 * end when it is long. Whatever style the text ends in is switched off, so it cannot run on into
 * the next thing drawn.
 */
export function fitStyled(text: string, columns: number): string {
  if (columns <= 0) return '';

  const length = visibleLength(text);

  if (length <= columns) return `${text}${RESET}${' '.repeat(columns - length)}`;

  // A wide character that does not fit leaves a blank, which is padded back so the width is exact.
  const body = take(text, columns - 1);
  const missing = Math.max(0, columns - 1 - visibleLength(body));

  return `${body}${RESET}${' '.repeat(missing)}…`;
}

/**
 * The text shown in reverse video. Its own resets would switch that off for the rest of the line,
 * so reverse is turned on again after each one.
 */
export function reverseAll(text: string): string {
  return `${REVERSE}${text.replace(/\u001b\[0?m/g, (reset) => `${reset}${REVERSE}`)}`;
}
