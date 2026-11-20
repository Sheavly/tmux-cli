import { MAIN_SESSION, listPanes, pendingChats, type PaneInfo } from '../session/panes.ts';
import { refreshChildren } from './children-refresh.ts';
import { refreshEdits } from './files-screen.ts';
import { settleProfile } from './profiles-screen.ts';
import type { Focus } from './render.ts';
import { CHAT_REFRESH_EVERY } from './sidebar.constants.ts';
import type { SidebarContext } from './sidebar.types.ts';

/** Which of our panes has the keyboard: the active pane of the main window, by its role. */
function readFocus(panes: PaneInfo[]): Focus {
  if (!process.env.TMUX_PANE) throw new Error('The sidebar must run inside tmux');

  const active = panes.find((pane) => pane.session === MAIN_SESSION && pane.active);

  return active?.role === 'sidebar' ? 'sidebar' : 'chat';
}

/** A new chat's pane learns which conversation it runs once the harness has stored it. */
async function adoptNewChats(ctx: SidebarContext): Promise<void> {
  const { adapter, session, state } = ctx;

  for (const claim of adapter.claimNewChats({ ...pendingChats(state.panes), chats: state.chats })) {
    await session.tag(claim.paneId, 'chat', claim.chatId);

    if (state.cursorKey === `c:${claim.paneId}`) state.cursorKey = `c:${claim.chatId}`;
  }
}

/** Reads what changed (panes, and on every few calls the chats too) and draws it. */
export async function refresh(ctx: SidebarContext): Promise<void> {
  const { adapter, session, tmux, state } = ctx;

  try {
    state.panes = await listPanes(tmux);
    state.focus = readFocus(state.panes);

    if (state.tick % CHAT_REFRESH_EVERY === 0) {
      const listing = await adapter.listChats();

      state.chats = listing.chats;
      state.problems = listing.problems;
      await settleProfile(ctx);
    }

    state.tick += 1;

    if (state.mode.kind === 'files') await refreshEdits(ctx, state.mode);

    await adoptNewChats(ctx);
    await refreshChildren(ctx);
    await session.reapFinished(state.panes);
    await session.reapStaleFollows(state.panes);
    await session.syncParkedSizes(state.panes);
  } catch (caughtError) {
    state.message = (caughtError as Error).message;
  }

  ctx.draw();
}
