import type { HarnessAdapter } from '../harness/adapter.types.ts';

/** What `sheavly-tmux recap <id>` prints; nothing when the adapter or the chat has no recap. */
export async function recapText(params: {
  adapter: HarnessAdapter;
  chatId: string;
}): Promise<string> {
  const { adapter, chatId } = params;

  if (!adapter.recap) return '';

  const { chats } = await adapter.listChats();
  const chat = chats.find((candidate) => candidate.id === chatId);

  // The command runs in the pane it prints in, so the width of its output is the pane's.
  return chat ? adapter.recap(chat, { columns: process.stdout.columns || 100 }) : '';
}
