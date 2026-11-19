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

/** Every line is exactly `width` wide, so drawing a screen overwrites the last one completely. */
export function renderScreen(screen: Screen): { lines: string[]; scrollTop: number } {
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
  const footerLines = footer.map((line) => padRight(line, inner.width));
  const lines = [...titleLines, ...body, ...filler, ...footerLines].slice(0, height);

  const marked = lines.map((line, index) =>
    withDivider({ line, lit: isLit({ index, total: lines.length, focus: screen.focus }) }),
  );

  return { lines: screen.divider ? marked : lines, scrollTop };
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
    const name = shortPath({ path: row.workspace, home: screen.home, max: width - 8 });
    const text = padRight(` ${arrow} ${name} (${row.count})`, width);

    return `${style.bold}${text}${style.reset}`;
  }

  if (row.kind === 'more') {
    return `${style.dim}${padRight(`   … ${row.hidden} older (a: all)`, width)}${style.reset}`;
  }

  return renderChat({ row, screen, selected });
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
  const { symbol, color } = MARKERS[row.state];
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

export const screenCodes = {
  // Autowrap off: a line that fills the last column must not push the next one down.
  // Focus reporting (1004): tmux says when this pane gains or loses the keyboard.
  enter: `${ESC}?1049h${ESC}?25l${ESC}?7l${ESC}?1004h`,
  leave: `${ESC}?1004l${ESC}?7h${ESC}?25h${ESC}?1049l`,
  home: `${ESC}H`,
  clear: `${ESC}2J`,
};

export function paint(lines: string[]): string {
  return screenCodes.home + lines.map((line) => `${line}${style.reset}`).join('\r\n');
}
