import type { Bindings } from '../keys/bindings.ts';
import type { ActionId } from '../keys/registry.ts';
import type { MouseEvent } from '../terminal/mouse.utils.ts';
import { movedCursor, type Move } from './cursor.utils.ts';
import type { ViewRow } from './diff.ts';
import {
  rowWidth,
  selectedText,
  spanOnRow,
  type Position,
  type Selection,
} from './selection.utils.ts';

/** What selecting needs to know about the view it is in, and to ask of it. */
export type SelectingView = {
  top: () => number;
  left: () => number;
  bodyHeight: () => number;
  /** Columns in front of the text of a row. */
  gutter: number;
  /** Scrolls and pans as little as it takes to bring a cell into view; does not draw. */
  reveal: (position: Position) => void;
  /** Scrolls by rows and draws. */
  scroll: (delta: number) => void;
};

/** The screen row where the first row of the view is: the title is above it. */
const BODY_TOP = 1;

/** In copy mode these keys of the viewer move the cursor, as they scroll outside it. */
const CURSOR_MOVES: Partial<Record<ActionId, Move>> = {
  'viewer.scrollUp': 'up',
  'viewer.scrollDown': 'down',
  'viewer.panLeft': 'left',
  'viewer.panRight': 'right',
  'viewer.pageUp': 'pageUp',
  'viewer.pageDown': 'pageDown',
  'viewer.top': 'top',
  'viewer.bottom': 'bottom',
};

/** The copy mode keys that move, and whether the move also selects. */
const COPY_MOVES: Partial<Record<ActionId, { move: Move; select: boolean }>> = {
  'copyMode.selectLeft': { move: 'left', select: true },
  'copyMode.selectRight': { move: 'right', select: true },
  'copyMode.selectUp': { move: 'up', select: true },
  'copyMode.selectDown': { move: 'down', select: true },
  'copyMode.wordPrevious': { move: 'wordPrevious', select: false },
  'copyMode.wordNext': { move: 'wordNext', select: false },
  'copyMode.selectWordPrevious': { move: 'wordPrevious', select: true },
  'copyMode.selectWordNext': { move: 'wordNext', select: true },
};

export type Selecting = {
  /** Whether the viewer is in copy mode, where keys move a cursor. */
  inCopyMode: () => boolean;
  /** The columns of a row to show selected (or under the cursor), `to` not included. */
  spanOn: (row: number) => readonly [from: number, to: number] | undefined;
  /** Starts copy mode, with the cursor on the middle row of what is in view. */
  enterCopyMode: () => void;
  /** Handles a key of copy mode; false when the key is not one and the viewer should have it. */
  key: (name: string) => Promise<boolean>;
  /** Handles the mouse: dragging selects, and letting go copies. */
  mouse: (event: MouseEvent) => Promise<void>;
};

/**
 * Selecting text in the viewer, the way copy mode in a chat does it: with the mouse, where letting
 * go of a drag copies, and with the keyboard, in a copy mode with a cursor. What is copied is the
 * text of the file, not what is on screen.
 */
export function createSelecting(params: {
  rows: ViewRow[];
  bindings: Bindings;
  view: SelectingView;
  copy: (text: string) => Promise<void>;
  redraw: () => void;
}): Selecting {
  const { rows, bindings, view, copy, redraw } = params;
  let cursor: Position | undefined;
  let selection: Selection | undefined;
  // Where the left button went down, and whether it has moved since.
  let pressed: Position | undefined;
  let dragged = false;

  function leaveCopyMode(): void {
    cursor = undefined;
    selection = undefined;
  }

  function moveCursor(params: { move: Move; select: boolean }): void {
    if (!cursor) return;

    const next = movedCursor({ rows, cursor, move: params.move, page: view.bodyHeight() });

    // With a selection already there a move extends it, like tmux's own copy mode.
    if (params.select && !selection) selection = { anchor: cursor, head: cursor };

    cursor = next;

    if (selection) selection = { ...selection, head: next };

    view.reveal(next);
    redraw();
  }

  async function copySelectionAndLeave(): Promise<void> {
    const taken = selection;

    leaveCopyMode();
    redraw();

    if (taken) await copy(selectedText({ rows, selection: taken }));
  }

  async function copyModeKey(action: ActionId): Promise<void> {
    if (action === 'copyMode.copy') {
      await copySelectionAndLeave();

      return;
    }

    // Escape drops a selection first and leaves with the next press; `q` leaves at once.
    if (action === 'copyMode.escape' && selection) selection = undefined;
    else leaveCopyMode();

    redraw();
  }

  async function key(name: string): Promise<boolean> {
    if (!cursor) return false;

    const copyAction = bindings.action('copyMode', name);
    const moving = copyAction ? COPY_MOVES[copyAction] : undefined;

    if (moving) {
      moveCursor(moving);

      return true;
    }

    if (copyAction) {
      await copyModeKey(copyAction);

      return true;
    }

    const viewerAction = bindings.action('viewer', name);
    const move = viewerAction ? CURSOR_MOVES[viewerAction] : undefined;

    if (!move) return false;

    moveCursor({ move, select: false });

    return true;
  }

  function enterCopyMode(): void {
    // The middle of the rows in view; a file shorter than the screen has fewer than fit.
    const inView = Math.min(view.bodyHeight(), rows.length - view.top());
    const row = Math.min(Math.max(view.top() + Math.floor((inView - 1) / 2), 0), rows.length - 1);
    const shown = rows[row];

    if (!shown) return;

    cursor = { row, column: Math.min(view.left(), Math.max(0, rowWidth(shown) - 1)) };
    redraw();
  }

  /** The cell under a point of the screen, held to what is in view and to the file. */
  function positionAt(event: MouseEvent): Position {
    const first = view.top();
    const row = first + event.row - BODY_TOP;
    const visible = Math.min(Math.max(row, first), first + view.bodyHeight() - 1);

    return {
      row: Math.min(visible, rows.length - 1),
      column: Math.max(0, view.left() + event.column - view.gutter),
    };
  }

  function press(event: MouseEvent): void {
    const marked = selection !== undefined || cursor !== undefined;

    pressed = positionAt(event);
    dragged = false;
    selection = undefined;

    if (cursor) cursor = pressed;

    if (marked) redraw();
  }

  function drag(event: MouseEvent): void {
    if (!pressed) return;

    // Past the top or bottom edge the view moves, so a selection can go on past what is in view.
    if (event.row < BODY_TOP) view.scroll(-1);
    else if (event.row >= BODY_TOP + view.bodyHeight()) view.scroll(1);

    const head = positionAt(event);

    dragged = true;
    selection = { anchor: pressed, head };

    if (cursor) cursor = head;

    redraw();
  }

  async function release(): Promise<void> {
    const taken = dragged ? selection : undefined;

    pressed = undefined;
    dragged = false;

    if (!taken) return;

    // Like copy mode in a chat, copying leaves it.
    leaveCopyMode();
    redraw();
    await copy(selectedText({ rows, selection: taken }));
  }

  async function mouse(event: MouseEvent): Promise<void> {
    if (rows.length === 0) return;

    if (event.kind === 'click') press(event);
    else if (event.kind === 'drag') drag(event);
    else if (event.kind === 'release') await release();
  }

  function spanOn(row: number): readonly [number, number] | undefined {
    if (selection) return spanOnRow({ selection, row });

    return cursor?.row === row ? [cursor.column, cursor.column + 1] : undefined;
  }

  return { inCopyMode: () => cursor !== undefined, spanOn, enterCopyMode, key, mouse };
}
