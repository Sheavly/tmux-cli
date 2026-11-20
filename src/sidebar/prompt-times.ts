import { writePromptTimes } from '../chats/prompt-times.ts';
import type { StoredChat } from '../harness/adapter.types.ts';
import type { SidebarContext } from './sidebar.types.ts';

/** Histories read at once: enough to be quick on a cold start without opening hundreds of files. */
const READ_AT_ONCE = 8;

/**
 * Reads the last prompt of every chat that changed since it was last read, when the user orders
 * chats by it. Does nothing otherwise, so the histories are never opened for nothing.
 */
export async function loadPromptTimes(ctx: SidebarContext): Promise<void> {
  const { adapter, state } = ctx;

  if (ctx.chatOrder !== 'prompted' || !adapter.lastPromptAt) return;

  const stale = state.chats.filter(
    (chat) => state.promptTimes.get(chat.id)?.updatedAt !== chat.updatedAt,
  );

  for (let from = 0; from < stale.length; from += READ_AT_ONCE) {
    await Promise.all(stale.slice(from, from + READ_AT_ONCE).map((chat) => readOne(ctx, chat)));
  }

  if (stale.length > 0) await saveQuietly(ctx);
}

async function readOne(ctx: SidebarContext, chat: StoredChat): Promise<void> {
  const { adapter, state } = ctx;
  const known = state.promptTimes.get(chat.id);

  try {
    const at = await adapter.lastPromptAt?.(chat);

    // No prompt at all: the chat's start, which is also where it would have been without this.
    state.promptTimes.set(chat.id, {
      at: at ?? known?.at ?? chat.startedAt,
      updatedAt: chat.updatedAt,
    });
  } catch {
    // Unreadable now: the time last known stays (a prompt time never goes back) and the read is
    // tried again at the next listing, because `updatedAt` was not brought up to date.
  }
}

async function saveQuietly(ctx: SidebarContext): Promise<void> {
  const { state } = ctx;

  try {
    await writePromptTimes({
      file: ctx.promptTimesFile,
      times: state.promptTimes,
      keep: new Set(state.chats.map((chat) => chat.id)),
    });
  } catch (caughtError) {
    state.message = `Cannot save ${ctx.promptTimesFile}: ${(caughtError as Error).message}`;
  }
}
