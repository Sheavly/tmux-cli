import type { HarnessAdapter } from '../harness/adapter.types.ts';

/**
 * What `sheavly-tmux follow <conversation id> <child id>` runs in its pane: writes what one child of
 * a chat writes, as it does, and then stays on screen so the end of it can be read. It takes no
 * input: nothing typed here reaches the child or the chat, and nothing typed is echoed.
 */
export async function runFollow(params: {
  adapter: HarnessAdapter;
  chatId: string;
  childId: string;
}): Promise<never> {
  const { adapter, chatId, childId } = params;

  ignoreInput();

  try {
    await followUntilEnd({ adapter, chatId, childId });
  } catch (caughtError) {
    const reason = caughtError instanceof Error ? caughtError.message : String(caughtError);

    process.stdout.write(`Cannot follow this: ${reason}\n`);
  }

  // The pane is the screen the user reads the end on; a process that exited would leave a dead one.
  return new Promise<never>(() => undefined);
}

async function followUntilEnd(params: {
  adapter: HarnessAdapter;
  chatId: string;
  childId: string;
}): Promise<void> {
  const { adapter, chatId, childId } = params;

  if (!adapter.children) throw new Error(`the ${adapter.name} adapter has no children to follow`);

  const { chats } = await adapter.listChats();
  const chat = chats.find((candidate) => candidate.id === chatId);

  if (!chat) throw new Error(`no stored chat ${chatId} under ${adapter.describeStore()}`);

  await adapter.children.follow({
    chat,
    childId,
    columns: process.stdout.columns || 100,
    write: (text) => process.stdout.write(text),
    signal: new AbortController().signal,
  });
}

/** Raw mode with nothing reading: keys are neither echoed into the output nor sent anywhere. */
function ignoreInput(): void {
  if (!process.stdin.isTTY) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', () => undefined);
}
