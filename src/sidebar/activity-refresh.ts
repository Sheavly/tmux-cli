import type { ChatActivity, HarnessAdapter } from '../harness/adapter.types.ts';
import { liveChats } from './live-chats.ts';
import type { SidebarState } from './sidebar.types.ts';

/**
 * Reads what each running chat is doing. Only chats with a live pane are asked, and only for what
 * happened since the pane started, so a chat that was stopped keeps nothing of what it was doing.
 */
export async function refreshActivity(ctx: {
  adapter: Pick<HarnessAdapter, 'activity'>;
  state: Pick<SidebarState, 'panes' | 'chats' | 'activity'>;
}): Promise<void> {
  const { adapter, state } = ctx;

  if (!adapter.activity) return;

  const next = new Map<string, ChatActivity>();

  for (const { chat, since } of liveChats(state)) {
    try {
      next.set(chat.id, await adapter.activity(chat, since));
    } catch {
      // A chat whose record can't be read shows nothing; it must not take the list with it.
    }
  }

  state.activity = next;
}
