import { writeName } from '../chats/names.ts';
import { fromTerminal, isPrintable, typedText } from '../keys/key.ts';
import type { Key } from './keys.ts';
import { actionFor } from './screen.ts';
import type { ChatRow, Mode, SidebarContext } from './sidebar.types.ts';
import type { Row } from './view.ts';
import { withoutLastGrapheme } from '../terminal/width.utils.ts';

type Renaming = Extract<Mode, { kind: 'rename' }>;

export function startRename(ctx: SidebarContext, row: Row | undefined): void {
  if (row?.kind !== 'chat' || !row.chatId) {
    ctx.state.message =
      'Select a stored chat to rename (a new chat can be renamed once it has started).';

    return;
  }

  ctx.state.mode = { kind: 'rename', chatId: row.chatId, text: '' };
}

/** An empty name removes the custom one, so the label from the first message shows again. */
export async function handleRename(
  ctx: SidebarContext,
  key: Key,
  renaming: Renaming,
): Promise<void> {
  const { state } = ctx;
  const { chatId, text } = renaming;
  const action = actionFor(ctx, 'rename', key);
  const read = fromTerminal(key);

  if (action === 'text.cancel') {
    state.mode = { kind: 'list' };
  } else if (action === 'text.erase') {
    state.mode = { kind: 'rename', chatId, text: withoutLastGrapheme(text) };
  } else if (action === 'text.submit') {
    state.mode = { kind: 'list' };
    await writeName({ file: ctx.namesFile, names: state.names, id: chatId, name: text });
  } else if (read !== undefined && isPrintable(read)) {
    state.mode = { kind: 'rename', chatId, text: text + typedText(read) };
  }
}

export function askDelete(ctx: SidebarContext, row: Row | undefined): void {
  if (!ctx.adapter.deleteChat) {
    ctx.state.message = 'This harness does not let chats be deleted from here.';

    return;
  }

  if (row?.kind !== 'chat') {
    ctx.state.message = 'Select a chat to delete.';

    return;
  }

  ctx.state.mode = { kind: 'confirm-delete', row };
}

/** Enter deletes the chat that was asked about; any other key leaves it alone. */
export async function handleConfirmDelete(
  ctx: SidebarContext,
  key: Key,
  row: ChatRow,
): Promise<void> {
  ctx.state.mode = { kind: 'list' };

  if (actionFor(ctx, 'confirm-delete', key) === 'confirm.delete') await deleteRow(ctx, row);
}

/** Stops the chat if it runs, then removes its stored conversation. */
async function deleteRow(ctx: SidebarContext, row: ChatRow): Promise<void> {
  const { adapter, session, state } = ctx;

  if (row.paneId) await session.stopChat(row.paneId);

  const chat = state.chats.find((candidate) => candidate.id === row.chatId);

  if (!chat) return;

  await adapter.deleteChat?.(chat);
  state.chats = state.chats.filter((candidate) => candidate.id !== chat.id);
  state.labels.delete(chat.id);

  if (state.names.has(chat.id)) {
    await writeName({ file: ctx.namesFile, names: state.names, id: chat.id, name: '' });
  }

  state.emptyLabelAt.delete(chat.id);
}

/** Enter stops every chat and quits; any other key leaves things as they are. */
export async function handleConfirmQuit(ctx: SidebarContext, key: Key): Promise<void> {
  ctx.state.mode = { kind: 'list' };

  if (actionFor(ctx, 'confirm-quit', key) === 'confirm.quit') await ctx.session.stop();
}
