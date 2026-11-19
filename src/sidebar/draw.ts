import { drawBrowser } from './browser-screen.ts';
import { drawFiles } from './files-screen.ts';
import { drawHelp } from './help-screen.ts';
import { drawList } from './list-screen.ts';
import { drawProfiles } from './profiles-screen.ts';
import type { SidebarContext } from './sidebar.types.ts';

/** Draws the screen that is showing. */
export function drawScreen(ctx: SidebarContext): void {
  const { mode } = ctx.state;

  switch (mode.kind) {
    case 'help':
      drawHelp(ctx, mode);
      break;
    case 'files':
      drawFiles(ctx, mode);
      break;
    case 'browse':
      drawBrowser(ctx, mode);
      break;
    case 'profiles':
      drawProfiles(ctx, mode);
      break;
    default:
      drawList(ctx);
  }
}
