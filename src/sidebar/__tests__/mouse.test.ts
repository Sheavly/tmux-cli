import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOUSE_ALL, type MouseSettings } from '../../config/mouse-settings.ts';
import type { StoredChat } from '../../harness/adapter.types.ts';
import type { OpenTarget } from '../../session/session.ts';
import type { MouseEvent } from '../../terminal/mouse.utils.ts';
import { rows } from '../list-screen.ts';
import { handleMouse } from '../mouse.ts';
import { renderScreen } from '../render.ts';
import type { Focus } from '../render.ts';
import type { SidebarContext } from '../sidebar.types.ts';

const chats: StoredChat[] = [
  { id: 'one', workspace: '/a', startedAt: 3, updatedAt: 3 },
  { id: 'two', workspace: '/a', startedAt: 2, updatedAt: 2 },
  { id: 'three', workspace: '/a', startedAt: 1, updatedAt: 1 },
];

/** A sidebar showing the three chats under one folder, drawn once so the rows are known. */
function sidebar(params: { mouse?: MouseSettings; focus?: Focus; height?: number } = {}) {
  const { mouse = MOUSE_ALL, focus = 'sidebar', height = 12 } = params;
  const opened: OpenTarget[] = [];
  const tmuxCalls: string[][] = [];
  const ctx = {
    chatOrder: 'started',
    mouse,
    adapter: {},
    session: {
      openChat: (target: OpenTarget) => {
        opened.push(target);

        return Promise.resolve('%1');
      },
    },
    tmux: {
      run: (args: string[]) => {
        tmuxCalls.push(args);

        return Promise.resolve('');
      },
    },
    draw: () => undefined,
    refresh: () => Promise.resolve(),
    state: {
      chats,
      children: new Map(),
      panes: [],
      activeProfile: '',
      labels: new Map(),
      names: new Map(),
      collapsed: new Set(),
      promptTimes: new Map(),
      folderOrder: [],
      showAll: true,
      runningOnly: false,
      mode: { kind: 'list' },
      message: '',
      focus,
      cursor: 0,
      cursorKey: '',
      scrollTop: 0,
      items: { firstRow: 0, top: 0, count: 0 },
    },
  } as unknown as SidebarContext;

  drawn(ctx, height);

  return { ctx, opened, tmuxCalls };
}

/** What a draw leaves behind: where the cursor is and where the rows are. */
function drawn(ctx: SidebarContext, height: number): void {
  const list = rows(ctx);
  const index = Math.max(
    0,
    list.findIndex((row) => row.key === ctx.state.cursorKey),
  );

  ctx.state.cursor = index;
  ctx.state.cursorKey = list[index]?.key ?? '';
  ctx.state.items = renderScreen({
    rows: list,
    cursor: index,
    scrollTop: ctx.state.scrollTop,
    width: 30,
    height,
    now: 0,
    home: '/h',
    footer: ['status'],
    divider: false,
    focus: ctx.state.focus,
  }).items;
}

const click = (row: number): MouseEvent => ({ kind: 'click', column: 4, row });
const keyOf = (ctx: SidebarContext, index: number): string => rows(ctx)[index]?.key ?? '';

test('a click selects the row it is on, and the next click on that row opens it', async () => {
  const { ctx, opened } = sidebar();
  // Row 0 is the folder; the chats are rows 1 to 3.
  const second = keyOf(ctx, 2);

  await handleMouse(ctx, click(2));

  assert.equal(ctx.state.cursorKey, second);
  assert.deepEqual(opened, []);

  drawn(ctx, 12);
  await handleMouse(ctx, click(2));

  assert.deepEqual(opened, [{ workspace: '/a', chatId: 'two' }]);
});

test('a click on the folder row folds it, and a click below the list does nothing', async () => {
  const { ctx, opened } = sidebar();

  // The cursor starts on the folder, so this click is on the selected row.
  await handleMouse(ctx, click(0));

  assert.ok(ctx.state.collapsed.has('/a'));
  drawn(ctx, 12);

  const before = ctx.state.cursorKey;

  await handleMouse(ctx, click(8));
  await handleMouse(ctx, click(11));

  assert.equal(ctx.state.cursorKey, before);
  assert.deepEqual(opened, []);
});

test('a click finds its row in a list that is scrolled', async () => {
  const { ctx } = sidebar({ height: 3 });

  // Two rows are visible above the one-line footer; scroll to the end of the four.
  ctx.state.cursorKey = keyOf(ctx, 3);
  drawn(ctx, 3);

  assert.equal(ctx.state.items.top, 2);

  await handleMouse(ctx, click(0));

  assert.equal(ctx.state.cursorKey, keyOf(ctx, 2));
});

test('the wheel moves the cursor three rows, unless scrolling is off', async () => {
  const { ctx } = sidebar();

  await handleMouse(ctx, { kind: 'wheelDown', column: 4, row: 2 });

  assert.equal(ctx.state.cursorKey, keyOf(ctx, 3));

  await handleMouse(ctx, { kind: 'wheelUp', column: 4, row: 2 });

  assert.equal(ctx.state.cursorKey, keyOf(ctx, 0));

  const off = sidebar({ mouse: { ...MOUSE_ALL, scroll: false } });

  await handleMouse(off.ctx, { kind: 'wheelDown', column: 4, row: 2 });

  assert.equal(off.ctx.state.cursorKey, keyOf(off.ctx, 0));
});

test('with focus off, opening a chat by mouse leaves the keyboard where it was', async () => {
  process.env.TMUX_PANE = '%7';

  const off = sidebar({ mouse: { ...MOUSE_ALL, focus: false } });
  const fromChat = sidebar({ mouse: { ...MOUSE_ALL, focus: false }, focus: 'chat' });
  const on = sidebar();

  for (const { ctx } of [off, fromChat, on]) {
    ctx.state.cursorKey = keyOf(ctx, 1);
    drawn(ctx, 12);
    await handleMouse(ctx, click(1));
  }

  assert.deepEqual(off.tmuxCalls, [['select-pane', '-t', '%7']]);
  assert.deepEqual(fromChat.tmuxCalls, []);
  assert.deepEqual(on.tmuxCalls, []);
  assert.equal(off.opened.length, 1);
});

test('only the chat list takes the mouse', async () => {
  const { ctx, opened } = sidebar();

  ctx.state.mode = { kind: 'confirm-quit' };
  await handleMouse(ctx, click(2));
  await handleMouse(ctx, { kind: 'wheelDown', column: 4, row: 2 });

  assert.equal(ctx.state.cursor, 0);
  assert.deepEqual(opened, []);
});
