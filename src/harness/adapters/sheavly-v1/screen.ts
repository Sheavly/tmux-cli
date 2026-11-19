/** A full-width rule, which may carry a note in it ("─── ↑ 2 more ───" when a prompt scrolls). */
const RULE_LEAD = /^─{3,}/;

/** The input box grows with a long prompt; past this many rows between its rules it is not one. */
const MAX_INPUT_ROWS = 40;

/**
 * The status line starts with `●` (ready, working, waiting) or, while it works, a spinner glyph
 * (the braille block). It can wrap in a narrow pane, so a few rows above the box are looked at.
 */
const STATUS_LEAD = /^\s*[●\u2800-\u28ff]/;
const MAX_STATUS_ROWS = 3;

function isRule(row: string): boolean {
  const text = row.trim();

  if (!RULE_LEAD.test(text)) return false;

  return Array.from(text).filter((char) => char === '─').length >= text.length * 0.6;
}

/**
 * What is written in the input box: the rows between the last two rules, joined with newlines and
 * trimmed at both ends. Empty when the box is empty; undefined when the screen has no box (it is
 * not sheavly's, or the chat has not drawn it yet), so nothing can be said about a prompt.
 */
export function promptText(rows: readonly string[]): string | undefined {
  let bottom = rows.length - 1;

  while (bottom >= 0 && !isRule(rows[bottom] as string)) bottom--;

  if (bottom < 0) return undefined;

  let top = bottom - 1;

  while (top >= 0 && !isRule(rows[top] as string)) top--;

  if (top < 0 || bottom - top - 1 > MAX_INPUT_ROWS) return undefined;

  return rows
    .slice(top + 1, bottom)
    .map((row) => row.trimEnd())
    .join('\n')
    .trim();
}

/**
 * The tmux keys that empty the input box holding `text`: down to its last row and its end, then
 * delete to the start of the line once per row plus one. At the start of a row that delete joins it
 * to the one above, so each press takes a row away until nothing is left.
 */
export function clearPromptKeys(text: string): string[] {
  const rows = text.split('\n').length;

  return [
    ...Array.from({ length: rows }, () => 'Down'),
    'C-e',
    ...Array.from({ length: rows + 1 }, () => 'C-u'),
  ];
}

/**
 * How many rows at the bottom of sheavly's terminal screen are its own controls: the status line
 * (state, model, context used), the rule above the input box, the input rows (a prompt being
 * written may take several) and the rule below it, and whatever is under that, such as the
 * completion list. Everything above is the conversation.
 *
 * The box is found by its two rules, the last two on the screen. Zero when there is no such pair,
 * so a screen that is not sheavly's keeps all its rows.
 */
export function chromeRows(rows: readonly string[]): number {
  let bottom = rows.length - 1;

  while (bottom >= 0 && !isRule(rows[bottom] as string)) bottom--;

  if (bottom < 0) return 0;

  let top = bottom - 1;

  while (top >= 0 && !isRule(rows[top] as string)) top--;

  if (top < 0 || bottom - top - 1 > MAX_INPUT_ROWS) return 0;

  // The status line sits right above the box (a row of conversation may be there instead, which
  // is not told apart by position, only by the glyph the status starts with).
  let start = top;

  for (let row = top - 1; row >= Math.max(0, top - MAX_STATUS_ROWS); row--) {
    const text = rows[row] as string;

    if (text.trim() === '') break;

    if (STATUS_LEAD.test(text)) {
      start = row;
      break;
    }
  }

  return rows.length - start;
}
