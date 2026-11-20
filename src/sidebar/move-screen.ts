import { writeFolderOrders } from '../chats/folder-order.ts';
import type { Key } from './keys.ts';
import { pinFolder, shiftFolder } from './folder-order.utils.ts';
import { actionFor } from './screen.ts';
import type { Mode, SidebarContext } from './sidebar.types.ts';
import type { Row } from './view.ts';

type Moving = Extract<Mode, { kind: 'move' }>;

/** Sets the moved folders of the profile the list shows; other profiles keep theirs. */
function setActiveFolderOrder(ctx: SidebarContext, order: string[]): void {
  const { state } = ctx;

  state.folderOrders = { ...state.folderOrders, [state.activeProfile]: order };
}

/** Saves the orders the state holds, saying so in the footer when the file cannot be written. */
async function saveFolderOrder(ctx: SidebarContext): Promise<void> {
  try {
    await writeFolderOrders({ file: ctx.folderOrderFile, orders: ctx.state.folderOrders });
  } catch (caughtError) {
    ctx.state.message = `Cannot save ${ctx.folderOrderFile}: ${(caughtError as Error).message}`;
  }
}

/** Pins the folder of the row at the end of the moved ones and lets the arrows place it. */
export async function startMove(ctx: SidebarContext, row: Row | undefined): Promise<void> {
  if (!row) {
    ctx.state.message = 'Select a folder to move.';

    return;
  }

  const { workspace } = row;

  setActiveFolderOrder(
    ctx,
    pinFolder(ctx.state.folderOrders[ctx.state.activeProfile] ?? [], workspace),
  );
  ctx.state.cursorKey = `w:${workspace}`;
  ctx.state.mode = { kind: 'move', workspace };
  await saveFolderOrder(ctx);
}

/** Up and down place the folder, `u` gives it back to the alphabet, and any leaving key keeps it. */
export async function handleMove(
  ctx: SidebarContext,
  key: Key,
  moving: Moving,
  list: Row[],
): Promise<void> {
  const { state } = ctx;
  const { workspace } = moving;
  const current = state.folderOrders[state.activeProfile] ?? [];
  const action = actionFor(ctx, 'move', key);
  const step = action === 'move.up' ? -1 : 1;

  if (action === 'move.up' || action === 'move.down') {
    const shown = new Set(list.map((row) => row.workspace));

    setActiveFolderOrder(ctx, shiftFolder({ pinned: current, folder: workspace, step, shown }));
    await saveFolderOrder(ctx);
  } else if (action === 'move.unpin') {
    setActiveFolderOrder(
      ctx,
      current.filter((folder) => folder !== workspace),
    );
    state.mode = { kind: 'list' };
    await saveFolderOrder(ctx);
  } else if (action === 'move.done') {
    state.mode = { kind: 'list' };
  }
}
