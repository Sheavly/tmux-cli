/** What a full-screen program does with the mouse: a click, or the wheel turned a notch. */
export type MouseEvent =
  | { kind: 'click'; column: number; row: number }
  | { kind: 'wheelUp' | 'wheelDown'; column: number; row: number };

/** How many rows one notch of the wheel moves, as in tmux's own scrolling. */
const WHEEL_ROWS = 3;

/** How far the wheel moves a list: up is negative; a click does not move it. */
export function wheelRows(mouse: MouseEvent): number {
  if (mouse.kind === 'wheelUp') return -WHEEL_ROWS;

  return mouse.kind === 'wheelDown' ? WHEEL_ROWS : 0;
}

/**
 * Splits input at the mouse reports in it, keeping them (the odd parts). A report is the form a
 * program asks for with `?1006h`: `ESC [ < button ; column ; row` and `M` for a press or `m` for a
 * release. The form of `?1000h` alone cannot say a column past 223.
 */
export const SPLIT_AT_REPORTS = /(\u001b\[<\d+;\d+;\d+[Mm])/u;

const REPORT_PARTS = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])$/u;
const WHEEL_BIT = 64;
const MOTION_BIT = 32;
/** Shift, Alt and Ctrl: a click with one held is for the terminal or tmux, not for us. */
const MODIFIER_BITS = 4 | 8 | 16;
const BUTTON_BITS = 3;

/**
 * What one report says, with the position counted from 0 at the top left of the pane. Nothing for
 * what is not used: a release, a move, another button, a click with a modifier held.
 */
export function parseMouseReport(report: string): MouseEvent | undefined {
  const match = REPORT_PARTS.exec(report);

  if (!match) return undefined;

  const [, code, column, row, final] = match as unknown as [string, string, string, string, string];
  const bits = Number(code);
  const position = { column: Number(column) - 1, row: Number(row) - 1 };

  if (final !== 'M' || bits & MOTION_BIT || bits & MODIFIER_BITS) return undefined;

  if (bits & WHEEL_BIT) {
    // Buttons 0 and 1 of the wheel are up and down; 2 and 3 are sideways.
    if ((bits & BUTTON_BITS) === 0) return { kind: 'wheelUp', ...position };

    return (bits & BUTTON_BITS) === 1 ? { kind: 'wheelDown', ...position } : undefined;
  }

  return (bits & BUTTON_BITS) === 0 ? { kind: 'click', ...position } : undefined;
}
