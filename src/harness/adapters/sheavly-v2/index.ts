import type {
  AdapterDefinition,
  EditState,
  HarnessAdapter,
  StoredChat,
} from '../../adapter.types.ts';
import { cleanLabel } from '../../../terminal/text.ts';
import { currentActivity } from '../sheavly-v1/activity.ts';
import { runningChildren } from '../sheavly-v1/children.ts';
import { claimNewChats } from '../sheavly-v1/claim.ts';
import { foldEdit } from '../sheavly-v1/edits.ts';
import { launchChoice } from '../sheavly-v1/launch-choice.ts';
import {
  resolveSheavlyV1Options,
  type SheavlyV1Options,
  type SheavlyV1Settings,
} from '../sheavly-v1/index.ts';
import { filterListable } from '../sheavly-v1/listable.ts';
import { chromeRows, clearPromptKeys, promptText } from '../sheavly-v1/screen.ts';
import { isChatId } from '../sheavly-v1/store.ts';
import { createApiClient, type ApiClient } from './client.ts';
import { connectionFromCommand } from './connection.ts';
import { createFilesFallback, type FilesFallback } from './files-fallback.ts';
import { followChild } from './follow.ts';
import { chatCommand } from './launch-command.utils.ts';
import { firstPrompt, lastPromptTime, readMessages, recapText } from './history.ts';
import {
  closeConversation,
  labelOfTitle,
  listChats,
  listProfiles,
  type TitleById,
} from './store.ts';
import { createWatchers, type EditChange } from './watch.ts';

const SHEAVLY_V2 = 'sheavly-v2';

/** What the registry knows this adapter by; it reads its own keys out of the config settings. */
export const sheavlyV2: AdapterDefinition = {
  name: SHEAVLY_V2,
  settingKeys: ['harnessDir', 'command', 'mode'],
  create: ({ settings, env, home }) => {
    const given = settings as SheavlyV1Settings;
    // The same settings and defaults as sheavly-v1 (its home is read only, for the fallback),
    // except for the command, which must start a chat on the server and not on a backend of its own.
    const options = resolveSheavlyV1Options({
      settings: { ...given, command: given.command ?? chatCommand(given.mode) },
      ...(env ? { env } : {}),
      ...(home ? { home } : {}),
    });

    return createSheavlyV2({
      ...options,
      client: createApiClient({ find: connectionFromCommand({ harnessDir: options.harnessDir }) }),
    });
  },
};

/** What an `edits.update` remembers: the changes it folded, to tell when there are new ones. */
type EditsCursor = { changes: EditChange[]; length: number };

/** Folds the changes the event stream told into the files list; true when it differs from before. */
function updateEditsFromStream(params: {
  changes: EditChange[];
  chat: StoredChat;
  state: EditState;
}): boolean {
  const { changes, chat, state } = params;
  const seen = state.cursor as EditsCursor | undefined;

  if (seen?.changes === changes && seen.length === changes.length) return false;

  state.files.clear();

  for (const change of changes) foldEdit({ state, workspace: chat.workspace, change });

  state.cursor = { changes, length: changes.length } satisfies EditsCursor;

  return true;
}

/** The files list of a chat that is not running, read from the harness's history files. */
async function updateEditsFromFiles(params: {
  fallback: FilesFallback;
  chat: StoredChat;
  state: EditState;
}): Promise<boolean> {
  const { fallback, chat, state } = params;
  const files = await fallback.forChat(chat);

  if (!files?.edits) return false;

  // The cursor is whichever source wrote it last: one of the stream's must not reach the files'.
  if ((state.cursor as Partial<EditsCursor> | undefined)?.changes) {
    state.cursor = undefined;
    state.files.clear();
  }

  return files.edits.update(chat, state);
}

/**
 * The adapter for sheavly's server: one server for every chat, asked over its HTTP API instead of
 * reading `~/.sheavly`. What a chat is doing, what it started and what it changed come from the
 * chat's event stream, opened for the chats being looked at. What the API does not give yet (the
 * history, recap and files of a chat that is not running, and what a command printed) is read,
 * only read, from the harness's files by `FilesFallback`; deleting a chat is left out, so its key
 * is absent.
 */
export function createSheavlyV2(options: SheavlyV1Options & { client: ApiClient }): HarnessAdapter {
  const { client } = options;
  const watchers = createWatchers({ client });
  const fallback = createFilesFallback({
    sheavlyHome: options.sheavlyHome,
    harnessDir: options.harnessDir,
    command: options.command,
  });
  // What the server titled each chat in the last listing, for `chatLabel`.
  let titles: TitleById = new Map();

  return {
    name: SHEAVLY_V2,
    isChatId,
    describeStore: () => 'the sheavly server',

    async listChats() {
      const listing = await listChats(client);
      const chats = await filterListable({ chats: listing.chats, harnessDir: options.harnessDir });

      titles = listing.titles;
      watchers.retain(chats.map((chat) => chat.id));

      return { chats, problems: listing.problems };
    },

    // The server has the history of a running chat only; the harness's files have the rest.
    async chatLabel(chat) {
      const fromTitle = labelOfTitle(titles.get(chat.id) ?? '');

      if (fromTitle !== undefined) return fromTitle;

      const messages = await readMessages({ client, id: chat.id });

      if (messages) return cleanLabel(firstPrompt(messages));

      return (await (await fallback.forChat(chat))?.chatLabel(chat)) ?? '';
    },

    // A chat that is in neither has the time it last changed, the nearest the server tells.
    async lastPromptAt(chat) {
      const messages = await readMessages({ client, id: chat.id });

      if (messages) return lastPromptTime(messages);

      const files = await fallback.forChat(chat);

      return files ? files.lastPromptAt?.(chat) : chat.updatedAt;
    },

    listProfiles: () => listProfiles(client),

    async recap(chat, terminal) {
      const messages = await readMessages({ client, id: chat.id });

      if (messages) return recapText(messages);

      return (await (await fallback.forChat(chat))?.recap?.(chat, terminal)) ?? '';
    },

    async activity(chat, since) {
      const { state } = await watchers.look(chat.id);

      return currentActivity({ state: state.activity, since });
    },

    children: {
      async list(chat, since) {
        return runningChildren({ state: (await watchers.look(chat.id)).state, since });
      },

      follow: ({ chat, childId, columns, write, signal }) =>
        followChild({
          client,
          chatId: chat.id,
          childId,
          columns,
          write,
          signal,
          followFiles: async () => {
            const files = await fallback.forChat(chat);

            if (!files?.children) return false;

            await files.children.follow({ chat, childId, columns, write, signal });

            return true;
          },
        }),
    },

    edits: {
      async update(chat, state) {
        const watch = await watchers.look(chat.id);

        return watch.notRunning
          ? updateEditsFromFiles({ fallback, chat, state })
          : updateEditsFromStream({ changes: watch.changes, chat, state });
      },
    },

    // The API has no delete yet, so the files are deleted. The sidebar has stopped the chat's pane
    // by now, but the server keeps the conversation live after its terminal is gone and writes to
    // its files, so it is closed first: a deleted folder would be written again.
    async deleteChat(chat) {
      const files = await fallback.forChat(chat);

      if (!files?.deleteChat) {
        throw new Error(`Cannot delete ${chat.id}: the harness files do not have it`);
      }

      await closeConversation({ client, id: chat.id });
      await files.deleteChat(chat);
    },

    launch(target) {
      return {
        cwd: options.harnessDir,
        env: { WORKSPACE_ROOT: target.workspace },
        command: `${options.command}${launchChoice(target)}`,
      };
    },

    claimNewChats,
    chromeRows,
    promptText,
    clearPromptKeys,
  };
}
