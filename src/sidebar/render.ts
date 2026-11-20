import type { ChatActivity } from '../harness/adapter.types.ts';
import { SPINNER_FRAME_MS, SPINNER_FRAMES } from '../terminal/spinner.constants.ts';
import { fitStyled, keepStyles } from '../terminal/ansi.ts';
import { relativeTime, type ChatState, type Row } from './view.ts';
import {
  displayWidth,
  fitColumns,
  takeLastColumns,
  truncateColumns,
} from '../terminal/width.utils.ts';

const ESC = '\u001b[';
const style = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  reverse: `${ESC}7m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  black: `${ESC}30m`,
  grey: `${ESC}38;5;240m`,
  lit: `${ESC}38;5;72m`,
  greenBackground: `${ESC}42m`,
  brightGreenBackground: `${ESC}102m`,
};

const MARKERS: Record<ChatState, { symbol: string; color: string }> = {
  shown: { symbol: '▶', color: style.green + style.bold },
  running: { symbol: '●', color: style.green },
  starting: { symbol: '…', color: style.yellow },
  ended: { symbol: '✕', color: style.red },
  stored: { symbol: '○', color: style.dim },
};

export type Screen = {
  rows: Row[];
  cursor: number;
  scrollTop: number;
  width: number;
  height: number;
  now: number;
  home: string;
  /** Lines under the list: a prompt, a message, the key help. */
  footer: string[];
  /** A bold row above the list, such as the profile the list is of; none when left out. */
  title?: string;
  /** Draw the divider line ourselves, one column in from the edge (see `dividerOptions`). */
  divider: boolean;
  /** Which pane has the keyboard: the divider's half beside it is lit. */
  focus: Focus;
};

/** Which pane has the keyboard. */
export type Focus = 'sidebar' | 'chat';

/**
 * Keeps the cursor row in view, moving the window as little as possible. With a `margin` it moves
 * as soon as the cursor is that many rows from an edge, so the rows next to it stay in sight; the
 * margin gives way in a window too small to hold it on both sides of the cursor.
 */
export function scrollFor(params: {
  cursor: number;
  scrollTop: number;
  visible: number;
  total: number;
  margin?: number;
}): number {
  const { cursor, scrollTop, visible, total } = params;
  const margin = Math.min(params.margin ?? 0, Math.floor((visible - 1) / 2));
  const maxTop = Math.max(0, total - visible);
  let top = scrollTop;

  if (cursor < top + margin) top = cursor - margin;
  else if (cursor > top + visible - 1 - margin) top = cursor - visible + 1 + margin;

  return Math.min(Math.max(top, 0), maxTop);
}

/** Where the list's rows are on screen, for a click to find the row it is on. */
export type ItemsOnScreen = {
  /** The screen row of the first row of the list. */
  firstRow: number;
  /** The index in the list of that first row. */
  top: number;
  /** How many rows of the list are shown. */
  count: number;
};

/** Every line is exactly `width` wide, so drawing a screen overwrites the last one completely. */
export function renderScreen(screen: Screen): {
  lines: string[];
  scrollTop: number;
  items: ItemsOnScreen;
} {
  const { rows, cursor, height, footer } = screen;
  const inner = { ...screen, width: screen.width - (screen.divider ? GUTTER.length : 0) };
  const titleLines =
    screen.title === undefined
      ? []
      : [`${style.bold}${padRight(` ${screen.title}`, inner.width)}${style.reset}`];
  const visible = Math.max(1, height - footer.length - titleLines.length);
  const scrollTop = scrollFor({ cursor, scrollTop: screen.scrollTop, visible, total: rows.length });
  const body = rows.slice(scrollTop, scrollTop + visible).map((row, offset) => {
    const selected = scrollTop + offset === cursor;
    const text = renderRow({ row, screen: inner, selected });

    // The chat on screen paints its own highlight, which the cursor changes rather than inverts.
    if (!selected || isOnScreen(row)) return text;

    return `${style.reverse}${text}${style.reset}`;
  });
  const blank = ' '.repeat(inner.width);
  const filler = Array.from({ length: Math.max(0, visible - body.length) }, () => blank);
  const footerLines = footer.map((line) => fitFooterLine(line, inner.width));
  const lines = [...titleLines, ...body, ...filler, ...footerLines].slice(0, height);

  const marked = lines.map((line, index) =>
    withDivider({ line, lit: isLit({ index, total: lines.length, focus: screen.focus }) }),
  );

  return {
    lines: screen.divider ? marked : lines,
    scrollTop,
    items: { firstRow: titleLines.length, top: scrollTop, count: body.length },
  };
}

/** A stretch of an item drawn in a colour or weight: `start` and `length` count characters. */
export type Accent = {
  start: number;
  length: number;
  style: 'red' | 'green' | 'yellow' | 'dim';
};

// Each ends with the code that undoes only itself, so a selected row stays reversed after it.
const ACCENTS: Record<Accent['style'], { on: string; off: string }> = {
  red: { on: style.red, off: `${ESC}39m` },
  green: { on: style.green, off: `${ESC}39m` },
  yellow: { on: style.yellow, off: `${ESC}39m` },
  dim: { on: style.dim, off: `${ESC}22m` },
};

/** The accents applied to a line that is already padded to its width. */
function withAccents(text: string, accents: Accent[]): string {
  const chars = Array.from(text);
  const sorted = accents.toSorted((a, b) => b.start - a.start);

  for (const accent of sorted) {
    const end = Math.min(chars.length, accent.start + accent.length);

    if (accent.start >= end) continue;

    const { on, off } = ACCENTS[accent.style];

    chars.splice(end, 0, off);
    chars.splice(accent.start, 0, on);
  }

  return chars.join('');
}

/** The folder picker: a title, a scrolling list of names with one selected, then a footer. */
export function renderBrowser(params: {
  title: string;
  items: string[];
  /** Colours for stretches of each item, in step with `items`. */
  accents?: Accent[][];
  cursor: number;
  scrollTop: number;
  width: number;
  height: number;
  footer: string[];
  divider: boolean;
  focus: Focus;
}): { lines: string[]; scrollTop: number } {
  const { items, cursor, height, footer } = params;
  const width = params.width - (params.divider ? GUTTER.length : 0);
  const visible = Math.max(1, height - footer.length - 1);
  // A negative cursor means nothing is selected (the help text), so there is no row to keep in
  // view and the scroll position is whatever the caller asks for.
  const maxTop = Math.max(0, items.length - visible);
  const scrollTop =
    cursor < 0
      ? Math.min(Math.max(0, params.scrollTop), maxTop)
      : scrollFor({ cursor, scrollTop: params.scrollTop, visible, total: items.length, margin: 1 });
  const title = `${style.bold}${padRight(` ${params.title}`, width)}${style.reset}`;
  const body = items.slice(scrollTop, scrollTop + visible).map((item, offset) => {
    const index = scrollTop + offset;
    const padded = padRight(`  ${item}`, width);
    // The two spaces in front of every item shift the accents with them.
    const accents = (params.accents?.[index] ?? []).map((accent) => ({
      ...accent,
      start: accent.start + 2,
    }));
    const text = accents.length > 0 ? withAccents(padded, accents) : padded;

    return index === cursor ? `${style.reverse}${text}${style.reset}` : text;
  });
  const blank = ' '.repeat(width);
  const filler = Array.from({ length: Math.max(0, visible - body.length) }, () => blank);
  const footerLines = footer.map((line) => padRight(line, width));
  const lines = [title, ...body, ...filler, ...footerLines].slice(0, height);

  if (!params.divider) return { lines, scrollTop };

  return {
    lines: lines.map((line, index) =>
      withDivider({ line, lit: isLit({ index, total: lines.length, focus: params.focus }) }),
    ),
    scrollTop,
  };
}

/** A blank column, then the line: the gap on the sidebar's side of the divider. */
const GUTTER = ' │';

/**
 * Like tmux's own divider: the top half belongs to the sidebar, the bottom half to the chat, and
 * the half beside the pane with the keyboard is lit.
 */
function isLit(params: { index: number; total: number; focus: Focus }): boolean {
  const inSidebarHalf = params.index < Math.floor(params.total / 2);

  return inSidebarHalf === (params.focus === 'sidebar');
}

function withDivider(params: { line: string; lit: boolean }): string {
  const color = params.lit ? style.lit : style.grey;

  return `${params.line}${style.reset}${color} │${style.reset}`;
}

function renderRow(params: { row: Row; screen: Screen; selected: boolean }): string {
  const { row, screen, selected } = params;
  const { width } = screen;

  if (row.kind === 'workspace') {
    const arrow = row.collapsed ? '▸' : '▾';
    const name = shortPath({ path: row.workspace, home: screen.home, max: width - 10 });
    const pin = row.pinned ? ' *' : '';
    const text = padRight(` ${arrow} ${name} (${row.count})${pin}`, width);

    return `${style.bold}${text}${style.reset}`;
  }

  if (row.kind === 'more') {
    return `${style.dim}${padRight(`   … ${row.hidden} older (a: all)`, width)}${style.reset}`;
  }

  if (row.kind === 'child') return renderChild({ row, width });

  return renderChat({ row, screen, selected });
}

/** What each kind of child is marked with, at the start of its row. */
const CHILD_SYMBOLS = { agent: '◆', process: '▸', service: '∞' } as const;

/**
 * A running sub-agent or background command, under its chat and indented one step more for each
 * level it is nested. Its colours end with codes that undo only themselves, so a selected row
 * stays reversed to its end.
 */
function renderChild(params: { row: Extract<Row, { kind: 'child' }>; width: number }): string {
  const { row, width } = params;
  const indent = ' '.repeat(2 + row.depth * 2);
  const room = Math.max(1, width - indent.length - 3);
  const name = padRight(truncate(row.name, room), room);
  const symbol = CHILD_SYMBOLS[row.childKind];

  if (row.shown) {
    return `${indent}${style.green}${style.bold}${symbol} ${name}${ESC}39m${ESC}22m `;
  }

  return `${indent}${style.lit}${symbol}${ESC}39m ${name} `;
}

/**
 * The symbol of what a running chat is doing. A chat that is working shows the loader's spinner,
 * at the frame the clock is at, so everything that turns does so together; one that waits for the
 * user shows a yellow `?`; an idle one the dot of a running chat.
 */
function activityMarker(activity: ChatActivity, now: number): (typeof MARKERS)[ChatState] {
  if (activity === 'awaiting_input') return { symbol: '?', color: style.yellow + style.bold };

  if (activity === 'running') {
    const frame = Math.floor(now / SPINNER_FRAME_MS) % SPINNER_FRAMES.length;

    return { symbol: SPINNER_FRAMES[frame] as string, color: style.green };
  }

  return MARKERS.running;
}

/** A status symbol with a count beside it, coloured as in the list; for a line that is not a row. */
export function activityCount(params: {
  activity: ChatActivity;
  count: number;
  now: number;
}): string {
  const { symbol, color } = activityMarker(params.activity, params.now);

  return `${color}${symbol}${params.count}${style.reset}`;
}

function markerOf(params: {
  row: Extract<Row, { kind: 'chat' }>;
  now: number;
}): (typeof MARKERS)[ChatState] {
  const { row, now } = params;

  return row.activity ? activityMarker(row.activity, now) : MARKERS[row.state];
}

function isOnScreen(row: Row): boolean {
  return row.kind === 'chat' && row.state === 'shown';
}

function renderChat(params: {
  row: Extract<Row, { kind: 'chat' }>;
  screen: Screen;
  selected: boolean;
}): string {
  const { row, screen, selected } = params;
  const { symbol, color } = markerOf({ row, now: screen.now });
  const age = row.updatedAt > 0 ? relativeTime({ now: screen.now, then: row.updatedAt }) : '';
  const labelWidth = Math.max(1, screen.width - 10);
  const label = padRight(truncate(row.label, labelWidth), labelWidth);
  const dim = row.state === 'stored' ? style.dim : '';

  if (row.state === 'shown') {
    const fill = selected ? style.brightGreenBackground : style.greenBackground;

    return `${fill}${style.black}${style.bold}  ${symbol} ${label} ${age.padStart(4)} ${style.reset}`;
  }

  return `  ${color}${symbol}${style.reset}${dim} ${label} ${age.padStart(4)} ${style.reset}`;
}

/** `~/verk` for a path under home; a long path keeps its end, which is the part that tells. */
export function shortPath(params: { path: string; home: string; max: number }): string {
  const { path, home, max } = params;
  const display =
    path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;

  return displayWidth(display) <= max ? display : `…${takeLastColumns(display, max - 1)}`;
}

/** The text cut to `width` columns with `…` where it was cut; as it is when it fits. */
export function truncate(text: string, width: number): string {
  return truncateColumns(text, width);
}

function padRight(text: string, width: number): string {
  return fitColumns(text, width);
}

/**
 * A footer line as exactly `width` columns. Most are plain text, measured as it is; a line with
 * colours in it is measured without them, and anything else it carries but colours is dropped.
 */
function fitFooterLine(line: string, width: number): string {
  return line.includes(ESC) ? fitStyled(keepStyles(line), width) : padRight(line, width);
}

export const screenCodes = {
  // Autowrap off: a line that fills the last column must not push the next one down.
  // Focus reporting (1004): tmux says when this pane gains or loses the keyboard.
  enter: `${ESC}?1049h${ESC}?25l${ESC}?7l${ESC}?1004h`,
  leave: `${ESC}?1004l${ESC}?7h${ESC}?25h${ESC}?1049l`,
  home: `${ESC}H`,
  clear: `${ESC}2J`,
  // Presses and the wheel (1000), in the form that has no limit on the column (1006). While a
  // program asks for them, tmux hands it the mouse and the terminal's own selection needs Shift.
  mouseOn: `${ESC}?1000h${ESC}?1006h`,
  mouseOff: `${ESC}?1006l${ESC}?1000l`,
  // As above, and the mouse moving with the left button held (1002), which is what a selection is.
  mouseDragOn: `${ESC}?1002h${ESC}?1006h`,
  mouseDragOff: `${ESC}?1006l${ESC}?1002l`,
};

export function paint(lines: string[]): string {
  return screenCodes.home + lines.map((line) => `${line}${style.reset}`).join('\r\n');
}
