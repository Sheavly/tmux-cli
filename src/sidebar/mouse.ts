import { wheelRows, type MouseEvent } from '../terminal/mouse.utils.ts';
import { activate, moveCursor, rows } from './list-screen.ts';
import type { SidebarContext } from './sidebar.types.ts';

/**
 * What the mouse does on the chat list: the wheel moves the cursor, a click selects the row it is
 * on, and a click on the selected row opens it (so a double click opens, as the second click lands
 * on the row the first selected). The other screens take keys only.
 */
export async function handleMouse(ctx: SidebarContext, mouse: MouseEvent): Promise<void> {
  if (ctx.state.mode.kind !== 'list') return;

  ctx.state.message = '';

  try {
    await act(ctx, mouse);
  } catch (caughtError) {
    ctx.state.message = (caughtError as Error).message;
  }

  await ctx.refresh();
}

async function act(ctx: SidebarContext, mouse: MouseEvent): Promise<void> {
  if (mouse.kind === 'click') {
    await clickRow({ ctx, row: mouse.row });

    return;
  }

  if (ctx.mouse.scroll) moveCursor(ctx, wheelRows(mouse));
}

async function clickRow(params: { ctx: SidebarContext; row: number }): Promise<void> {
  const { ctx, row } = params;
  const { items, cursor } = ctx.state;
  const offset = row - items.firstRow;

  // Past the list: the title, the empty rows under it, the footer.
  if (offset < 0 || offset >= items.count) return;

  const clicked = rows(ctx)[items.top + offset];

  if (!clicked) return;

  if (items.top + offset !== cursor) {
    ctx.state.cursorKey = clicked.key;

    return;
  }

  const hadFocus = ctx.state.focus;

  await activate(ctx);

  // Opening a chat gives it the keyboard; with the mouse not to change focus, it goes back.
  if (!ctx.mouse.focus && hadFocus === 'sidebar') await giveKeyboardToSidebar(ctx);
}

async function giveKeyboardToSidebar(ctx: SidebarContext): Promise<void> {
  const pane = process.env.TMUX_PANE;

  if (pane) await ctx.tmux.run(['select-pane', '-t', pane]);
}
