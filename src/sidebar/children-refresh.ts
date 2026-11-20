import type { ChatChild, HarnessAdapter } from '../harness/adapter.types.ts';
import type { SidebarState } from './sidebar.types.ts';

/**
 * Reads what each running chat has started and is still running. Only chats with a live pane are
 * asked, and only for what started since the pane did: a chat that was stopped, however it was
 * stopped, leaves its children "running" in the harness's own record, and they are not. A chat
 * that has no pane any more is dropped from the list at the next look.
 */
export async function refreshChildren(ctx: {
  adapter: Pick<HarnessAdapter, 'children'>;
  state: Pick<SidebarState, 'panes' | 'chats' | 'children'>;
}): Promise<void> {
  const { adapter, state } = ctx;

  if (!adapter.children) return;

  const next = new Map<string, ChatChild[]>();

  for (const pane of state.panes) {
    const chat =
      pane.role === 'chat' && !pane.dead && pane.chat !== ''
        ? state.chats.find((candidate) => candidate.id === pane.chat)
        : undefined;

    if (!chat) continue;

    try {
      const children = await adapter.children.list(chat, pane.startedAt);

      if (children.length > 0) next.set(chat.id, children);
    } catch {
      // A chat whose record can't be read has no children to show; it must not take the list with it.
    }
  }

  state.children = next;
}
