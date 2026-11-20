import { writeFolderOrder } from '../chats/folder-order.ts';
import type { Key } from './keys.ts';
import { pinFolder, shiftFolder } from './folder-order.utils.ts';
import { actionFor } from './screen.ts';
import type { Mode, SidebarContext } from './sidebar.types.ts';
import type { Row } from './view.ts';

type Moving = Extract<Mode, { kind: 'move' }>;

/** Saves the order the state holds, saying so in the footer when the file cannot be written. */
async function saveFolderOrder(ctx: SidebarContext): Promise<void> {
  try {
    await writeFolderOrder({ file: ctx.folderOrderFile, order: ctx.state.folderOrder });
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

  ctx.state.folderOrder = pinFolder(ctx.state.folderOrder, workspace);
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
  const action = actionFor(ctx, 'move', key);
  const step = action === 'move.up' ? -1 : 1;

  if (action === 'move.up' || action === 'move.down') {
    const shown = new Set(list.map((row) => row.workspace));

    state.folderOrder = shiftFolder({ pinned: state.folderOrder, folder: workspace, step, shown });
    await saveFolderOrder(ctx);
  } else if (action === 'move.unpin') {
    state.folderOrder = state.folderOrder.filter((folder) => folder !== workspace);
    state.mode = { kind: 'list' };
    await saveFolderOrder(ctx);
  } else if (action === 'move.done') {
    state.mode = { kind: 'list' };
  }
}
