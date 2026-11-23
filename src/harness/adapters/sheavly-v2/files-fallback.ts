import type { HarnessAdapter, StoredChat } from '../../adapter.types.ts';
import { createSheavlyV1, type SheavlyV1Options } from '../sheavly-v1/index.ts';

/** How long a listing of the harness's files is trusted before a chat it didn't have is looked for. */
const REFRESH_MS = 5_000;

/**
 * What the server's API can't give yet, read from the harness's own files in the way sheavly-v1
 * does: the history, recap and files of a chat that is not running, and what a command printed.
 * It is a stopgap, to be dropped member by member as the API serves them. It reads, and the one
 * thing it writes is deleting a stored chat, which the adapter only asks of it for a chat the
 * server says is not running (files under a chat that is live are the server's to write).
 */
export type FilesFallback = {
  /** The adapter that reads this chat's files, or undefined when they don't have the chat. */
  forChat: (chat: Pick<StoredChat, 'id'>) => Promise<HarnessAdapter | undefined>;
};

export function createFilesFallback(options: SheavlyV1Options): FilesFallback {
  const files = createSheavlyV1(options);
  let known = new Set<string>();
  let listedAt = 0;

  /** The files' own listing, which is also what teaches `files` where each chat's folder is. */
  async function list(): Promise<void> {
    listedAt = Date.now();

    try {
      known = new Set((await files.listChats()).chats.map((chat) => chat.id));
    } catch {
      // A fallback that can't read the folder has nothing to give; the API's answer stands.
      known = new Set();
    }
  }

  return {
    async forChat(chat) {
      if (!known.has(chat.id) && Date.now() - listedAt > REFRESH_MS) await list();

      return known.has(chat.id) ? files : undefined;
    },
  };
}
