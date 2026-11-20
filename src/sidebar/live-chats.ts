import type { StoredChat } from '../harness/adapter.types.ts';
import type { SidebarState } from './sidebar.types.ts';

/**
 * The stored chats that have a live pane, each with when its pane started. What a chat's record
 * says is only about the process running now when it is read from this time on: a chat that was
 * stopped, however it was stopped, leaves its last words behind.
 */
export function liveChats(
  state: Pick<SidebarState, 'panes' | 'chats'>,
): { chat: StoredChat; since: number }[] {
  const live: { chat: StoredChat; since: number }[] = [];

  for (const pane of state.panes) {
    if (pane.role !== 'chat' || pane.dead || pane.chat === '') continue;

    const chat = state.chats.find((candidate) => candidate.id === pane.chat);

    if (chat) live.push({ chat, since: pane.startedAt });
  }

  return live;
}
