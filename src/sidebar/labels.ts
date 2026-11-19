import type { StoredChat } from '../harness/adapter.types.ts';
import type { SidebarContext } from './sidebar.types.ts';
import type { Row } from './view.ts';

function needsLabel(ctx: SidebarContext, id: string, chat: StoredChat | undefined): boolean {
  const { labels, loadingLabels, emptyLabelAt } = ctx.state;

  if (!chat || loadingLabels.has(id)) return false;

  return !labels.has(id) || (emptyLabelAt.has(id) && emptyLabelAt.get(id) !== chat.updatedAt);
}

async function labelOf(ctx: SidebarContext, chat: StoredChat): Promise<string> {
  try {
    return await ctx.adapter.chatLabel(chat);
  } catch (caughtError) {
    ctx.state.message = `Cannot read ${chat.id}: ${(caughtError as Error).message}`;

    return 'Unreadable chat';
  }
}

/** Reads the label of each chat in view that has none yet, then draws the list again. */
export async function loadMissingLabels(ctx: SidebarContext, list: Row[]): Promise<void> {
  const { state } = ctx;
  const wanted = new Map(state.chats.map((chat) => [chat.id, chat]));
  const missing = list
    .flatMap((row) => (row.kind === 'chat' && row.chatId ? [row.chatId] : []))
    .filter((id) => needsLabel(ctx, id, wanted.get(id)));

  for (const id of missing) state.loadingLabels.add(id);

  for (const id of missing) {
    const chat = wanted.get(id) as StoredChat;
    const label = await labelOf(ctx, chat);

    if (label) state.emptyLabelAt.delete(id);
    else state.emptyLabelAt.set(id, chat.updatedAt);

    state.labels.set(id, label || 'Untitled chat');
    state.loadingLabels.delete(id);
  }

  if (missing.length === 0) return;

  state.lastPaint = '';
  ctx.draw();
}
