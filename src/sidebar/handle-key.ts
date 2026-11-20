import { handleBrowse } from './browser-screen.ts';
import { handleFiles } from './files-screen.ts';
import { handleHelp } from './help-screen.ts';
import type { Key } from './keys.ts';
import { handleList, rows } from './list-screen.ts';
import { handleMove } from './move-screen.ts';
import { handleProfiles } from './profiles-screen.ts';
import { handleConfirmDelete, handleConfirmQuit, handleRename } from './prompts.ts';
import { handleSearch } from './search-screen.ts';
import type { SidebarContext } from './sidebar.types.ts';

/** Hands the key to the screen that is showing. */
async function dispatch(ctx: SidebarContext, key: Key): Promise<void> {
  const { mode } = ctx.state;

  switch (mode.kind) {
    case 'confirm-delete':
      await handleConfirmDelete(ctx, key, mode.row);
      break;
    case 'help':
      handleHelp(ctx, key, mode);
      break;
    case 'files':
      await handleFiles(ctx, key, mode);
      break;
    case 'profiles':
      await handleProfiles(ctx, key, mode);
      break;
    case 'browse':
      await handleBrowse(ctx, key, mode);
      break;
    case 'move':
      await handleMove(ctx, key, mode, rows(ctx));
      break;
    case 'rename':
      await handleRename(ctx, key, mode);
      break;
    case 'search':
      handleSearch(ctx, key, rows(ctx));
      break;
    case 'confirm-quit':
      await handleConfirmQuit(ctx, key);
      break;
    default:
      await handleList(ctx, key);
  }
}

export async function handleKey(ctx: SidebarContext, key: Key): Promise<void> {
  // A focus report only says to look again; it must not wipe a message the user hasn't read.
  if (key === 'focus') {
    await ctx.refresh();

    return;
  }

  ctx.state.message = '';

  try {
    await dispatch(ctx, key);
  } catch (caughtError) {
    ctx.state.message = (caughtError as Error).message;
  }

  await ctx.refresh();
}
